// Supabase Edge Function – deploy with: supabase functions deploy analyze-maintenance-doc
// Set OPENAI_API_KEY in Supabase secrets

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { attachment_id } = await req.json()
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: attachment, error: attError } = await supabase
      .from('machine_attachments')
      .select('storage_path, filename')
      .eq('id', attachment_id)
      .single()

    if (attError || !attachment) throw new Error('Anhang nicht gefunden')

    const { data: fileData, error: dlError } = await supabase.storage
      .from('machine-documents')
      .download(attachment.storage_path)

    if (dlError || !fileData) throw new Error('PDF konnte nicht geladen werden')

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) throw new Error('OPENAI_API_KEY nicht gesetzt')

    const text = await fileData.text().slice(0, 12000)

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Extrahiere Wartungsplan als JSON: {"title":"...","frequency_days":30,"checklist_items":["..."],"summary":"..."}`,
          },
          { role: 'user', content: text },
        ],
      }),
    })

    const aiData = await aiRes.json()
    const plan = JSON.parse(aiData.choices[0].message.content)

    return new Response(JSON.stringify(plan), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
