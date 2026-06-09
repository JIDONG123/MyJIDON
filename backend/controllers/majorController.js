const pool = require('../config/database');
const { parseId, trimOrNull } = require('../utils/curriculumHelpers');

const listMajors = async (req, res) => {
  try {
    const status = req.query.status;
    let sql = 'SELECT id, code, name, college, description, status, created_at, updated_at FROM majors';
    const params = [];
    if (status !== undefined && status !== '') {
      sql += ' WHERE status = ?';
      params.push(Number(status) ? 1 : 0);
    }
    sql += ' ORDER BY code';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取专业列表失败', error: error.message });
  }
};

const getMajorById = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [rows] = await pool.query('SELECT * FROM majors WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '专业不存在' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取专业失败', error: error.message });
  }
};

const createMajor = async (req, res) => {
  try {
    const code = trimOrNull(req.body.code, 32);
    const name = trimOrNull(req.body.name, 100);
    if (!code || !name) {
      return res.status(400).json({ success: false, message: '专业代码与名称必填' });
    }
    const [result] = await pool.query(
      'INSERT INTO majors (code, name, college, description, status) VALUES (?, ?, ?, ?, ?)',
      [
        code,
        name,
        trimOrNull(req.body.college, 100),
        trimOrNull(req.body.description),
        req.body.status === 0 || req.body.status === '0' ? 0 : 1,
      ]
    );
    res.status(201).json({ success: true, message: '创建成功', id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: '专业代码已存在' });
    }
    res.status(500).json({ success: false, message: '创建失败', error: error.message });
  }
};

const updateMajor = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const code = trimOrNull(req.body.code, 32);
    const name = trimOrNull(req.body.name, 100);
    if (!code || !name) {
      return res.status(400).json({ success: false, message: '专业代码与名称必填' });
    }
    const [r] = await pool.query(
      'UPDATE majors SET code = ?, name = ?, college = ?, description = ?, status = ? WHERE id = ?',
      [
        code,
        name,
        trimOrNull(req.body.college, 100),
        trimOrNull(req.body.description),
        req.body.status === 0 || req.body.status === '0' ? 0 : 1,
        id,
      ]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: '专业不存在' });
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: '专业代码已存在' });
    }
    res.status(500).json({ success: false, message: '更新失败', error: error.message });
  }
};

const deleteMajor = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [r] = await pool.query('DELETE FROM majors WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: '专业不存在' });
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
};

module.exports = {
  listMajors,
  getMajorById,
  createMajor,
  updateMajor,
  deleteMajor,
};
