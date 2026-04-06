// supabase/functions/declare-winner/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ethers } from 'https://esm.sh/ethers@6.13.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { record } = await req.json()

    // Only trigger on finished matches that have a winner but no declare_tx yet
    if (record?.status !== 'finished' || !record?.winner_wallet || record?.declare_tx) {
      return new Response('OK', { headers: corsHeaders })
    }

    const RPC_URL = Deno.env.get('BASE_RPC') || 'https://mainnet.base.org'
    const ESCROW_ADDRESS = Deno.env.get('ESCROW_CONTRACT_ADDRESS')
    const ADMIN_PRIVATE_KEY = Deno.env.get('ADMIN_PRIVATE_KEY')

    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider)

    const ESCROW_ABI = [
      'function declareWinner(bytes32 matchId, address winner) external'
    ]

    const contract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, adminWallet)

    const uuidToBytes32 = (uuid) => {
      const hex = uuid.replace(/-/g, '')
      return '0x' + hex.padEnd(64, '0')
    }

    const matchIdBytes32 = uuidToBytes32(record.id)

    console.log(`Auto-declaring winner for match ${record.id}`)

    const tx = await contract.declareWinner(matchIdBytes32, record.winner_wallet)
    const receipt = await tx.wait()

    // Update Supabase so we don't process it again
    await supabase
      .from('matches')
      .update({ declare_tx: tx.hash })
      .eq('id', record.id)

    console.log(`✅ Winner declared on-chain - TX: ${tx.hash}`)

    return new Response('Success', { headers: corsHeaders })
  } catch (err) {
    console.error('Error in declare-winner function:', err)
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: corsHeaders 
    })
  }
})