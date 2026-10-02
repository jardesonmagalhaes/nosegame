const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const SUPABASE_URL = "https://weaffqocmxfczgwketrb.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function applyBancaMargin(marketOdd, discountPercent = 0.25) {
    if (!marketOdd || marketOdd <= 1.0) return 1.05;
    const profit = marketOdd - 1;
    const adjustedProfit = profit * (1 - discountPercent);
    return parseFloat((1 + adjustedProfit).toFixed(2));
}

async function syncDailyMatches() {
    console.log("🚀 A iniciar a sincronização de jogos...");
    
    // Pega a data de hoje e de amanhã para garantir que encontra jogos
    const today = new Date().toISOString().split('T')[0];
    
    try {
        console.log(`🔍 A procurar jogos na API para a data: ${today}...`);
        const response = await axios.get(`https://v3.football.api-sports.io/fixtures?date=${today}`, {
            headers: { 'x-apisports-key': API_FOOTBALL_KEY }
        });

        const fixtures = response.data.response || [];
        console.log(`⚽ Total de jogos retornados pela API: ${fixtures.length}`);

        if (fixtures.length === 0) {
            console.log("⚠️ Nenhum jogo encontrado para hoje na API.");
            return;
        }

        // Pega os primeiros 15 jogos
        const sampleFixtures = fixtures.slice(0, 15);

        for (const item of sampleFixtures) {
            const leagueName = item.league.name || 'Liga Esportiva';
            const countryName = item.league.country || 'Mundo';
            const homeTeam = item.teams.home.name;
            const awayTeam = item.teams.away.name;
            const matchTime = item.fixture.date;

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
                odd_btts_yes: applyBancaMargin(1.85, 0.25),
                odd_btts_no: applyBancaMargin(1.85, 0.25)
            };

            const { data, error } = await supabase.from('matches').insert([matchPayload]).select();
            
            if (error) {
                console.error(`❌ Erro ao Inserir [${homeTeam} x ${awayTeam}]:`, error.message);
            } else {
                console.log(`✅ Sucesso ao Inserir: ${homeTeam} x ${awayTeam}`);
            }
        }

        console.log("✨ Processo concluído!");
    } catch (err) {
        console.error("❌ Erro ao conectar com a API:", err.message);
        process.exit(1);
    }
}

syncDailyMatches();
