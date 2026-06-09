#!/usr/bin/env node
/** 显式允许写库的种子数据入口：SCRIPT_ALLOW_MUTATION=1 */
process.env.SCRIPT_ALLOW_MUTATION = '1';
require('./seed-test-data.js');
