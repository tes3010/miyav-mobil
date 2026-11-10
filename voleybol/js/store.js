// Uygulama genelinde paylaşılan veriler (takımlar ve oyuncular önbelleği)
import { db } from './db.js';
import { DEFAULT_TEAMS } from './config.js';

export const store = {
  user: null,
  teams: [],
  players: [],

  async loadAll() {
    let teams = await db.select('teams', { order: ['sort', 'name'] });
    if (!teams.length) {
      // İlk girişte 5 takımı otomatik oluştur
      teams = await db.insert('teams', DEFAULT_TEAMS);
      teams.sort((a, b) => a.sort - b.sort);
    }
    this.teams = teams;
    const [settings] = await Promise.all([db.select('settings'), this.loadPlayers()]);
    this.settings = settings[0]?.data || {};
  },

  async loadPlayers() {
    this.players = await db.select('players', { order: ['jersey_no', 'full_name'] });
  },

  team(id) { return this.teams.find(t => t.id === id); },

  teamPlayers(teamId, { includeInactive = false } = {}) {
    return this.players
      .filter(p => p.team_id === teamId && (includeInactive || p.active !== false))
      .sort((a, b) => (a.jersey_no ?? 999) - (b.jersey_no ?? 999) || a.full_name.localeCompare(b.full_name, 'tr'));
  },
};
