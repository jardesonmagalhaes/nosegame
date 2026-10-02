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

// Lista de jogos garantidos caso a API do plano Free bloqueie o ano
const FALLBACK_MATCHES = [
    { league: "Brasil - Brasileirão Série A", home: "Flamengo", away: "Palmeiras", rawH: 2.10, rawD: 3.20, rawA: 3.50 },
    { league: "Brasil - Brasileirão Série A", home: "São Paulo", away: "Corinthians", rawH: 2.25, rawD: 3.10, rawA: 3.30 },
    { league: "Brasil - Brasileirão Série A", home: "Atlético-MG", away: "Cruzeiro", rawH: 1.95, rawD: 3.30, rawA: 3.80 },
    { league: "Inglaterra - Premier League", home: "Arsenal", away: "Chelsea", rawH: 1.85, rawD: 3.60, rawA: 4.10 },
    { league: "Inglaterra - Premier League", home: "Manchester City", away: "Liverpool", rawH: 2.05, rawD: 3.50, rawA: 3.40 },
    { league: "Espanha - La Liga", home: "Real Madrid", away: "Barcelona", rawH: 2.15, rawD: 3.40, rawA: 3.20 },
    { league: "UEFA - Champions League", home: "Bayern München", away: "PSG", rawH: 1.90, rawD: 3.70, rawA: 3.60 }
];

async function syncDailyMatches() {
    console.log("🚀 A iniciar a sincronização inteligente de jogos...");
    
    let totalSaved = 0;
    const todayStr = new Date().toISOString().split('T')[0];

    try {
        console.log(`🔍 Procurando partidas na API-Football...`);
        const response = await axios.get(`https://v3.football.api-sports.io/fixtures?date=${todayStr}`, {
            headers: { 'x-apisports-key': API_FOOTBALL_KEY }
        });

        const fixtures = response.data.response || [];

        if (fixtures.length > 0) {
            console.log(`⚽ Encontradas ${fixtures.length} partidas ativas na API!`);
            for (const item of fixtures.slice(0, 10)) {
                const matchPayload = {
                    league: `${item.league?.country || 'Mundo'} - ${item.league?.name || 'Liga Esportiva'}`,
                    home_team: item.teams?.home?.name || 'Time Casa',
                    away_team: item.teams?.away?.name || 'Time Fora',
                    match_time: item.fixture?.date || new Date().toISOString(),
                    status: 'OPEN',
                    odd_home: applyBancaMargin(2.10, 0.25),
                    odd_draw: applyBancaMargin(3.20, 0.25),
                    odd_away: applyBancaMargin(3.40, 0.25),
                    odd_over15: applyBancaMargin(1.28, 0.25),
                    odd_under15: applyBancaMargin(3.00, 0.25),
                    odd_over25: applyBancaMargin(1.85, 0.25),
                    odd_under25: applyBancaMargin(1.85, 0.25),
                    odd_btts_yes: applyBancaMargin(1.80, 0.25),
                    odd_btts_no: applyBancaMargin(1.90, 0.25)
                };
                const { error } = await supabase.from('matches').insert([matchPayload]);
                if (!error) totalSaved++;
            }
        }
    } catch (err) {
        console.log("⚠️️ Erro na consulta da API. A carregar catálogo alternativo de segurança.");
    }

    // Se a API retornou 0 jogos devido à restrição do plano Free, ativa a lista de segurança imediatamente
    if (totalSaved === 0) {
        console.log("🔄 API sem jogos para a data. A gerar partidas atualizadas com cotações com -25%...");
        
        for (const m of FALLBACK_MATCHES) {
            const matchDate = new Date();
            matchDate.setHours(19, 0, 0, 0);

            const matchPayload = {
                league: m.league,
                home_team: m.home,
                away_team: m.away,
                match_time: matchDate.toISOString(),
                status: 'OPEN',
                odd_home: applyBancaMargin(m.rawH, 0.25),
                odd_draw: applyBancaMargin(m.rawD, 0.25),
                odd_away: applyBancaMargin(m.rawA, 0.25),
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

            const { error } = await supabase.from('matches').insert([matchPayload]);
            if (!error) {
                console.log(`✅ Partida adicionada com sucesso: ${m.home} x ${m.away}`);
                totalSaved++;
            } else {
                console.error(`❌ Erro ao inserir ${m.home} x ${m.away}:`, error.message);
            }
        }
    }

    console.log(`✨ Processo finalizado! Total de partidas guardadas no Supabase: ${totalSaved}`);
}

syncDailyMatches();
