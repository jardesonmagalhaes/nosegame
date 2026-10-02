const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const SUPABASE_URL = "https://weaffqocmxfczgwketrb.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY || !API_FOOTBALL_KEY) {
    console.error("❌ ERRO CRÍTICO: Secrets não encontradas!");
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
    console.log("🚀 A iniciar a sincronização geral de jogos...");

    // Gerar datas para hoje e os próximos 3 dias
    const datesToTest = [];
    for (let i = 0; i <= 3; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        datesToTest.push(d.toISOString().split('T')[0]);
    }

    let totalSaved = 0;

    for (const dateStr of datesToTest) {
        console.log(`🔍 Procurando partidas gerais para a data: ${dateStr}...`);

        try {
            // Chamada direta de todos os jogos da data sem filtro restritivo de época/liga
            const response = await axios.get(`https://v3.football.api-sports.io/fixtures?date=${dateStr}`, {
                headers: { 'x-apisports-key': API_FOOTBALL_KEY }
            });

            const fixtures = response.data.response || [];
            console.log(`⚽ Partidas retornadas pela API para ${dateStr}: ${fixtures.length}`);

            if (fixtures.length > 0) {
                // Selecionar até 15 jogos dessa data
                const sampleFixtures = fixtures.slice(0, 15);

                for (const item of sampleFixtures) {
                    const leagueName = item.league?.name || 'Liga Geral';
                    const countryName = item.league?.country || 'Mundo';
                    const homeTeam = item.teams?.home?.name || 'Time Casa';
                    const awayTeam = item.teams?.away?.name || 'Time Fora';
                    const matchTime = item.fixture?.date || new Date().toISOString();

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
                        console.error(`❌ Erro [${homeTeam} x ${awayTeam}]: ${error.message}`);
                    } else {
                        console.log(`✅ Guardado no Supabase: ${countryName} - ${homeTeam} x ${awayTeam}`);
                        totalSaved++;
                    }
                }
            }
        } catch (err) {
            console.error(`❌ Erro na requisição da data ${dateStr}:`, err.message);
        }

        if (totalSaved >= 15) break; // Limite de jogos por execução
    }

    console.log(`✨ Sincronização concluída! Total de jogos guardados: ${totalSaved}`);
}

syncDailyMatches();
