-- Qwen-VL 视觉识别模型管理端配置项
INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'qwen_vl_enabled', '1', '是否启用 Qwen-VL 图像识别'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'qwen_vl_enabled');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'qwen_vl_api_base', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'Qwen-VL API Base URL'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'qwen_vl_api_base');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'qwen_vl_api_key', '', 'Qwen-VL API Key（明文存储，读取时脱敏）'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'qwen_vl_api_key');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'qwen_vl_model', 'qwen3-vl-plus', 'Qwen-VL 模型名称'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'qwen_vl_model');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'qwen_vl_last_test_status', '', 'Qwen-VL 最近一次测试状态'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'qwen_vl_last_test_status');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'qwen_vl_last_test_at', '', 'Qwen-VL 最近一次测试时间'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'qwen_vl_last_test_at');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'qwen_vl_last_test_message', '', 'Qwen-VL 最近一次测试消息'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'qwen_vl_last_test_message');
