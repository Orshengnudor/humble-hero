use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("FGtLhCjkY79KgAiZBY4ajffuv46EBbYK3APNvd53J1Ko");

const MAX_PLAYERS: usize = 10;
const PLATFORM_FEE_BPS: u64 = 500;
const MIN_ENTRY_LAMPORTS: u64 = 1_000_000;
const MAX_ENTRY_LAMPORTS: u64 = 10_000_000_000;
const CLAIM_WINDOW_SECONDS: i64 = 7 * 24 * 60 * 60;

#[program]
pub mod humble_hero {
    use super::*;

    pub fn create_match(
        ctx: Context<CreateMatch>,
        match_id: [u8; 32],
        max_players: u8,
        entry_lamports: u64,
    ) -> Result<()> {
        require!(max_players >= 2, HumbleError::TooFewPlayers);
        require!(max_players as usize <= MAX_PLAYERS, HumbleError::TooManyPlayers);
        require!(entry_lamports >= MIN_ENTRY_LAMPORTS, HumbleError::EntryFeeTooLow);
        require!(entry_lamports <= MAX_ENTRY_LAMPORTS, HumbleError::EntryFeeTooHigh);

        let clock = Clock::get()?;

        // Transfer first, before taking mutable borrow of escrow
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.host.to_account_info(),
                    to: ctx.accounts.match_escrow.to_account_info(),
                },
            ),
            entry_lamports,
        )?;

        let escrow = &mut ctx.accounts.match_escrow;
        escrow.match_id       = match_id;
        escrow.host            = ctx.accounts.host.key();
        escrow.admin           = ctx.accounts.admin.key();
        escrow.max_players     = max_players;
        escrow.entry_lamports  = entry_lamports;
        escrow.total_lamports  = entry_lamports;
        escrow.player_count    = 1;
        escrow.status          = MatchStatus::Waiting;
        escrow.winner          = None;
        escrow.prize_claimed   = false;
        escrow.created_at      = clock.unix_timestamp;
        escrow.finished_at     = None;
        escrow.bump            = ctx.bumps.match_escrow;
        escrow.players         = [[0u8; 32]; MAX_PLAYERS];
        escrow.players[0]      = ctx.accounts.host.key().to_bytes();

        emit!(MatchCreated {
            match_id,
            host: ctx.accounts.host.key(),
            max_players,
            entry_lamports,
        });

        Ok(())
    }

    pub fn join_match(ctx: Context<JoinMatch>, match_id: [u8; 32]) -> Result<()> {
        let player_key = ctx.accounts.player.key();

        // Check status before mutable borrow
        require!(ctx.accounts.match_escrow.status == MatchStatus::Waiting, HumbleError::MatchNotOpen);
        require!(
            ctx.accounts.match_escrow.player_count < ctx.accounts.match_escrow.max_players,
            HumbleError::MatchFull
        );

        let already_joined = ctx.accounts.match_escrow.players
            [..ctx.accounts.match_escrow.player_count as usize]
            .iter()
            .any(|p| *p == player_key.to_bytes());
        require!(!already_joined, HumbleError::AlreadyJoined);

        let entry_lamports = ctx.accounts.match_escrow.entry_lamports;

        // Transfer before mutable borrow
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.match_escrow.to_account_info(),
                },
            ),
            entry_lamports,
        )?;

        let escrow = &mut ctx.accounts.match_escrow;
        let idx = escrow.player_count as usize;
        escrow.players[idx]    = player_key.to_bytes();
        escrow.player_count   += 1;
        escrow.total_lamports += entry_lamports;

        if escrow.player_count >= escrow.max_players {
            escrow.status = MatchStatus::InProgress;
        }

        emit!(PlayerJoined {
            match_id,
            player: player_key,
            player_count: escrow.player_count,
            total_lamports: escrow.total_lamports,
        });

        Ok(())
    }

    pub fn declare_winner(
        ctx: Context<DeclareWinner>,
        match_id: [u8; 32],
        winner: Pubkey,
    ) -> Result<()> {
        let clock = Clock::get()?;

        require!(
            ctx.accounts.admin.key() == ctx.accounts.match_escrow.admin,
            HumbleError::Unauthorized
        );
        require!(
            ctx.accounts.match_escrow.status == MatchStatus::InProgress
                || ctx.accounts.match_escrow.status == MatchStatus::Waiting,
            HumbleError::MatchAlreadyFinished
        );
        require!(!ctx.accounts.match_escrow.prize_claimed, HumbleError::PrizeAlreadyClaimed);

        let is_valid_winner = ctx.accounts.match_escrow.players
            [..ctx.accounts.match_escrow.player_count as usize]
            .iter()
            .any(|p| *p == winner.to_bytes());
        require!(is_valid_winner, HumbleError::InvalidWinner);

        let escrow = &mut ctx.accounts.match_escrow;
        escrow.status      = MatchStatus::Finished;
        escrow.winner      = Some(winner);
        escrow.finished_at = Some(clock.unix_timestamp);

        emit!(WinnerDeclared {
            match_id,
            winner,
            prize_lamports: escrow.total_lamports,
        });

        Ok(())
    }

    pub fn claim_prize(ctx: Context<ClaimPrize>, match_id: [u8; 32]) -> Result<()> {
        let clock = Clock::get()?;

        require!(ctx.accounts.match_escrow.status == MatchStatus::Finished, HumbleError::MatchNotFinished);
        require!(!ctx.accounts.match_escrow.prize_claimed, HumbleError::PrizeAlreadyClaimed);

        let winner = ctx.accounts.match_escrow.winner.ok_or(HumbleError::NoWinnerDeclared)?;
        require!(ctx.accounts.winner.key() == winner, HumbleError::NotWinner);

        let finished_at = ctx.accounts.match_escrow.finished_at.ok_or(HumbleError::MatchNotFinished)?;
        require!(
            clock.unix_timestamp <= finished_at + CLAIM_WINDOW_SECONDS,
            HumbleError::ClaimWindowExpired
        );

        let total = ctx.accounts.match_escrow.total_lamports;

        let platform_fee = total
            .checked_mul(PLATFORM_FEE_BPS)
            .ok_or(HumbleError::Overflow)?
            .checked_div(10_000)
            .ok_or(HumbleError::Overflow)?;

        let winner_payout = total
            .checked_sub(platform_fee)
            .ok_or(HumbleError::Overflow)?;

        // Do all lamport transfers before taking mutable borrow
        **ctx.accounts.match_escrow.to_account_info().try_borrow_mut_lamports()? -= winner_payout;
        **ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += winner_payout;

        **ctx.accounts.match_escrow.to_account_info().try_borrow_mut_lamports()? -= platform_fee;
        **ctx.accounts.admin_fee_wallet.to_account_info().try_borrow_mut_lamports()? += platform_fee;

        // Now take mutable borrow to update state
        let escrow = &mut ctx.accounts.match_escrow;
        escrow.prize_claimed  = true;
        escrow.total_lamports = 0;

        emit!(PrizeClaimed {
            match_id,
            winner,
            winner_payout,
            platform_fee,
        });

        Ok(())
    }

    pub fn refund_match(ctx: Context<RefundMatch>, match_id: [u8; 32]) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.match_escrow.admin,
            HumbleError::Unauthorized
        );
        require!(!ctx.accounts.match_escrow.prize_claimed, HumbleError::PrizeAlreadyClaimed);

        let escrow = &mut ctx.accounts.match_escrow;
        escrow.status         = MatchStatus::Refunded;
        escrow.total_lamports = 0;

        emit!(MatchRefunded {
            match_id,
            players_refunded: escrow.player_count,
        });

        Ok(())
    }

    pub fn reclaim_expired(ctx: Context<ReclaimExpired>, match_id: [u8; 32]) -> Result<()> {
        let clock = Clock::get()?;

        require!(
            ctx.accounts.admin.key() == ctx.accounts.match_escrow.admin,
            HumbleError::Unauthorized
        );
        require!(ctx.accounts.match_escrow.status == MatchStatus::Finished, HumbleError::MatchNotFinished);
        require!(!ctx.accounts.match_escrow.prize_claimed, HumbleError::PrizeAlreadyClaimed);

        let finished_at = ctx.accounts.match_escrow.finished_at.ok_or(HumbleError::MatchNotFinished)?;
        require!(
            clock.unix_timestamp > finished_at + CLAIM_WINDOW_SECONDS,
            HumbleError::ClaimWindowNotExpired
        );

        let amount = ctx.accounts.match_escrow.total_lamports;

        **ctx.accounts.match_escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.admin_fee_wallet.to_account_info().try_borrow_mut_lamports()? += amount;

        let escrow = &mut ctx.accounts.match_escrow;
        escrow.prize_claimed  = true;
        escrow.total_lamports = 0;

        emit!(PrizeReclaimed { match_id, amount });

        Ok(())
    }
}

// ─── Account Structs ─────────────────────────────────────────────────────────

#[account]
pub struct MatchEscrow {
    pub match_id:       [u8; 32],
    pub host:           Pubkey,
    pub admin:          Pubkey,
    pub max_players:    u8,
    pub player_count:   u8,
    pub players:        [[u8; 32]; MAX_PLAYERS],
    pub entry_lamports: u64,
    pub total_lamports: u64,
    pub status:         MatchStatus,
    pub winner:         Option<Pubkey>,
    pub prize_claimed:  bool,
    pub created_at:     i64,
    pub finished_at:    Option<i64>,
    pub bump:           u8,
}

impl MatchEscrow {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 1 + 1 + (32 * MAX_PLAYERS) + 8 + 8 + 1 + 33 + 1 + 8 + 9 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum MatchStatus {
    Waiting,
    InProgress,
    Finished,
    Refunded,
}

// ─── Contexts ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(match_id: [u8; 32])]
pub struct CreateMatch<'info> {
    #[account(
        init,
        payer = host,
        space = MatchEscrow::LEN,
        seeds = [b"match_escrow", match_id.as_ref()],
        bump,
    )]
    pub match_escrow: Account<'info, MatchEscrow>,

    #[account(mut)]
    pub host: Signer<'info>,

    /// CHECK: Admin pubkey stored for authorization
    pub admin: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(match_id: [u8; 32])]
pub struct JoinMatch<'info> {
    #[account(
        mut,
        seeds = [b"match_escrow", match_id.as_ref()],
        bump = match_escrow.bump,
    )]
    pub match_escrow: Account<'info, MatchEscrow>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(match_id: [u8; 32])]
pub struct DeclareWinner<'info> {
    #[account(
        mut,
        seeds = [b"match_escrow", match_id.as_ref()],
        bump = match_escrow.bump,
    )]
    pub match_escrow: Account<'info, MatchEscrow>,

    #[account(
        constraint = admin.key() == match_escrow.admin @ HumbleError::Unauthorized
    )]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(match_id: [u8; 32])]
pub struct ClaimPrize<'info> {
    #[account(
        mut,
        seeds = [b"match_escrow", match_id.as_ref()],
        bump = match_escrow.bump,
    )]
    pub match_escrow: Account<'info, MatchEscrow>,

    #[account(mut)]
    pub winner: Signer<'info>,

    /// CHECK: Admin fee wallet
    #[account(
        mut,
        constraint = admin_fee_wallet.key() == match_escrow.admin @ HumbleError::Unauthorized
    )]
    pub admin_fee_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(match_id: [u8; 32])]
pub struct RefundMatch<'info> {
    #[account(
        mut,
        seeds = [b"match_escrow", match_id.as_ref()],
        bump = match_escrow.bump,
    )]
    pub match_escrow: Account<'info, MatchEscrow>,

    #[account(
        constraint = admin.key() == match_escrow.admin @ HumbleError::Unauthorized
    )]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(match_id: [u8; 32])]
pub struct ReclaimExpired<'info> {
    #[account(
        mut,
        seeds = [b"match_escrow", match_id.as_ref()],
        bump = match_escrow.bump,
    )]
    pub match_escrow: Account<'info, MatchEscrow>,

    #[account(
        constraint = admin.key() == match_escrow.admin @ HumbleError::Unauthorized
    )]
    pub admin: Signer<'info>,

    /// CHECK: Admin wallet receives reclaimed funds
    #[account(mut)]
    pub admin_fee_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct MatchCreated {
    pub match_id:       [u8; 32],
    pub host:           Pubkey,
    pub max_players:    u8,
    pub entry_lamports: u64,
}

#[event]
pub struct PlayerJoined {
    pub match_id:       [u8; 32],
    pub player:         Pubkey,
    pub player_count:   u8,
    pub total_lamports: u64,
}

#[event]
pub struct WinnerDeclared {
    pub match_id:       [u8; 32],
    pub winner:         Pubkey,
    pub prize_lamports: u64,
}

#[event]
pub struct PrizeClaimed {
    pub match_id:      [u8; 32],
    pub winner:        Pubkey,
    pub winner_payout: u64,
    pub platform_fee:  u64,
}

#[event]
pub struct MatchRefunded {
    pub match_id:         [u8; 32],
    pub players_refunded: u8,
}

#[event]
pub struct PrizeReclaimed {
    pub match_id: [u8; 32],
    pub amount:   u64,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum HumbleError {
    #[msg("Match requires at least 2 players")]
    TooFewPlayers,
    #[msg("Match cannot have more than 10 players")]
    TooManyPlayers,
    #[msg("Entry fee is below the minimum (0.001 SOL)")]
    EntryFeeTooLow,
    #[msg("Entry fee exceeds the maximum (10 SOL)")]
    EntryFeeTooHigh,
    #[msg("Match is not open for joining")]
    MatchNotOpen,
    #[msg("Match is already full")]
    MatchFull,
    #[msg("Wallet has already joined this match")]
    AlreadyJoined,
    #[msg("Only the platform admin can perform this action")]
    Unauthorized,
    #[msg("Match has already been finished")]
    MatchAlreadyFinished,
    #[msg("Match has not finished yet")]
    MatchNotFinished,
    #[msg("Prize has already been claimed")]
    PrizeAlreadyClaimed,
    #[msg("No winner has been declared for this match")]
    NoWinnerDeclared,
    #[msg("Only the winner can claim this prize")]
    NotWinner,
    #[msg("Provided winner is not a player in this match")]
    InvalidWinner,
    #[msg("Claim window has expired (7 days)")]
    ClaimWindowExpired,
    #[msg("Claim window has not expired yet")]
    ClaimWindowNotExpired,
    #[msg("Arithmetic overflow")]
    Overflow,
}