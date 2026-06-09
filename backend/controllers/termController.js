const pool = require('../config/database');
const { parseId, trimOrNull } = require('../utils/curriculumHelpers');

const SEASONS = ['spring', 'autumn', 'summer', 'winter'];

const listTerms = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, year, season, start_date, end_date, is_current, created_at, updated_at FROM terms ORDER BY year DESC, id DESC'
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取学期列表失败', error: error.message });
  }
};

const getTermById = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [rows] = await pool.query('SELECT * FROM terms WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '学期不存在' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取学期失败', error: error.message });
  }
};

const createTerm = async (req, res) => {
  try {
    const name = trimOrNull(req.body.name, 64);
    const year = parseInt(String(req.body.year), 10);
    const season = SEASONS.includes(req.body.season) ? req.body.season : 'autumn';
    if (!name || !Number.isFinite(year)) {
      return res.status(400).json({ success: false, message: '学期名称与学年必填' });
    }
    const isCurrent = req.body.isCurrent === 1 || req.body.isCurrent === true || req.body.is_current === 1;
    if (isCurrent) {
      await pool.query('UPDATE terms SET is_current = 0');
    }
    const [result] = await pool.query(
      'INSERT INTO terms (name, year, season, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?, ?)',
      [
        name,
        year,
        season,
        req.body.startDate || req.body.start_date || null,
        req.body.endDate || req.body.end_date || null,
        isCurrent ? 1 : 0,
      ]
    );
    res.status(201).json({ success: true, message: '创建成功', id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: '学期名称已存在' });
    }
    res.status(500).json({ success: false, message: '创建失败', error: error.message });
  }
};

const updateTerm = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const name = trimOrNull(req.body.name, 64);
    const year = parseInt(String(req.body.year), 10);
    const season = SEASONS.includes(req.body.season) ? req.body.season : 'autumn';
    if (!name || !Number.isFinite(year)) {
      return res.status(400).json({ success: false, message: '学期名称与学年必填' });
    }
    const isCurrent = req.body.isCurrent === 1 || req.body.isCurrent === true || req.body.is_current === 1;
    if (isCurrent) {
      await pool.query('UPDATE terms SET is_current = 0 WHERE id <> ?', [id]);
    }
    const [r] = await pool.query(
      'UPDATE terms SET name = ?, year = ?, season = ?, start_date = ?, end_date = ?, is_current = ? WHERE id = ?',
      [
        name,
        year,
        season,
        req.body.startDate || req.body.start_date || null,
        req.body.endDate || req.body.end_date || null,
        isCurrent ? 1 : 0,
        id,
      ]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: '学期不存在' });
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败', error: error.message });
  }
};

const deleteTerm = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [r] = await pool.query('DELETE FROM terms WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: '学期不存在' });
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
};

module.exports = {
  listTerms,
  getTermById,
  createTerm,
  updateTerm,
  deleteTerm,
};
