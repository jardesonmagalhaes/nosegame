const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const SUPABASE_URL = "https://weaffqocmxfczgwketrb.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY || !API_FOOTBALL_KEY) {
    console.error("❌ ERRO CRÍTICO: Chaves de ambiente (Secrets) não foram encontradas!");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function applyBancaMargin(marketOdd, discountPercent = 0.25) {
    if (!marketOdd || isNaN(marketOdd) || marketOdd <= 1.0) return 1.05;
    const profit = marketOdd - 1;
    const adjustedProfit = profit * (1 - discountPercent);
    return parseFloat((1 + adjustedProfit).toFixed(2));
}

async function syncDailyMatches() {
    console.log("🚀 A iniciar a sincronização com validação estrita...");
    
    // Obter a data atual no formato YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];

    try {
        console.log(`🔍 Procurando partidas na API para a data: ${today}...`);
        const response = await axios.get(`https://v3.football.api-sports.io/fixtures?date=${today}`, {
            headers: { 'x-apisports-key': API_FOOTBALL_KEY }
        });

        const fixtures = response.data.response || [];
        console.log(`⚽ Partidas encontradas na API: ${fixtures.length}`);

        if (fixtures.length === 0) {
            console.log("⚠️ A API não retornou partidas para o dia de hoje.");
            return;
        }

        // Processar até 10 partidas
        const sampleFixtures = fixtures.slice(0, 10);

        for (const item of sampleFixtures) {
            const leagueName = item.league?.name || 'Liga Geral';
            const countryName = item.league?.country || 'Mundo';
            const homeTeam = item.teams?.home?.name || 'Time Casa';
            const awayTeam = item.teams?.away?.name || 'Time Fora';
            const matchTime = item.fixture?.date || new Date().toISOString();

            // Objeto completo garantindo todas as colunas da tabela matches
            const matchPayload = {
                league: `${countryName} - ${leagueName}`,
                home_team: homeTeam,
                away_team: awayTeam,
                match_time: matchTime,
                status: 'OPEN',
                odd_home: applyBancaMargin(2.10, 0.25),
                odd_draw: applyBancaMargin(3.20, 0.25),
                odd_away: applyBancaMargin(3.40, 0.25),
                odd_over15: applyBancaMargin(1.28, 0.25),
                odd_under15: applyBancaMargin(3.00, 0.25),
                odd_over25: applyBancaMargin(1.85, 0.25),
                odd_under25: applyBancaMargin(1.85, 0.25),
                odd_btts_yes: applyBancaMargin(1.80, 0.25),
                odd_btts_no: applyBancaMargin(1.90, 0.25),
                odd_dc1x: applyBancaMargin(1.25, 0.25),
                odd_dc_x2: applyBancaMargin(1.35, 0.25),
                odd_dc_12: applyBancaMargin(1.28, 0.25)
            };

            const { data, error } = await supabase.from('matches').insert([matchPayload]).select();

            if (error) {
                console.error(`❌ FALHA AO INSERIR JOGO (${homeTeam} x ${awayTeam}):`);
                console.error(`👉 Detalhe do erro do Supabase:`, error.message);
                console.error(`👉 Código de erro:`, error.code);
            } else {
                console.log(`✅ SUCESSO! Jogo gravado ID: ${data[0]?.id} (${homeTeam} x ${awayTeam})`);
            }
        }

    } catch (err) {
        console.error("❌ ERRO DE REDE/API:", err.response?.data || err.message);
        process.exit(1);
    }
}

syncDailyMatches();
