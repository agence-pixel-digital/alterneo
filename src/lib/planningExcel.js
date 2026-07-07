const XLSX = require('xlsx');

const TYPES_MAP = {
  entreprise: 'entreprise',
  ecole: 'ecole', 'ecoles': 'ecole',
  conge: 'conge', 'conges': 'conge',
  recuperation: 'recuperation', recup: 'recuperation',
  absent: 'absent', absence: 'absent'
};

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeType(raw) {
  if (!raw) return null;
  const key = stripAccents(String(raw).trim().toLowerCase());
  return TYPES_MAP[key] || null;
}

function normalizeModalite(raw) {
  if (!raw) return null;
  const key = stripAccents(String(raw).trim().toLowerCase());
  if (key === 'presentiel') return 'presentiel';
  if (key === 'distanciel') return 'distanciel';
  return null;
}

function normalizeDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !isNaN(raw)) {
    const y = raw.getFullYear(), m = String(raw.getMonth() + 1).padStart(2, '0'), d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  const fr = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (fr) return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;
  return null;
}

// Lit la première feuille d'un classeur Excel (colonnes Date, Type) et renvoie
// les lignes exploitables. Les lignes vides ou l'en-tête sont ignorées ;
// les lignes mal formées sont comptabilisées pour information à l'admin.
function parseExcelPlanning(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const lignes = [];
  let ignorees = 0;
  rows.forEach(row => {
    if (!row || row.length === 0) return;
    const date = normalizeDate(row[0]);
    const type = normalizeType(row[1]);
    const modalite = type === 'entreprise' ? normalizeModalite(row[2]) : null;
    if (!date && !type) return; // ligne vide ou en-tête
    if (date && type) lignes.push({ date, type, modalite });
    else ignorees++;
  });
  return { lignes, ignorees };
}

module.exports = { parseExcelPlanning };
