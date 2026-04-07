import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Security check
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
    const adminWallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);

    const contract = new ethers.Contract(
      process.env.ESCROW_CONTRACT_ADDRESS,
      ['function declareWinner(bytes32 matchId, address winner) external'],
      adminWallet
    );

    const uuidToBytes32 = (uuid) => '0x' + uuid.replace(/-/g, '').padEnd(64, '0');

    // Get finished matches that need declaration
    const { data: matches, error } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'finished')
      .not('winner_wallet', 'is', null)
      .is('declare_tx', null)
      .limit(20);   // Limit to avoid timeout

    if (error) throw error;

    let processed = 0;

    for (const match of matches || []) {
      try {
        const tx = await contract.declareWinner(uuidToBytes32(match.id), match.winner_wallet);
        await tx.wait();

        await supabase
          .from('matches')
          .update({ declare_tx: tx.hash })
          .eq('id', match.id);

        processed++;
        console.log(`✅ Declared winner for match ${match.id.slice(0,8)}`);
      } catch (err) {
        console.error(`❌ Failed for match ${match.id}:`, err.message);
      }
    }

    const duration = Date.now() - startTime;

    res.status(200).json({
      success: true,
      processed,
      duration_ms: duration,
      message: `Processed ${processed} matches in ${duration}ms`
    });

  } catch (error) {
    console.error('Cron job failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}