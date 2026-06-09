-- Knowledge graph Neo4j admin settings
INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'kg_neo4j_enabled', '0', 'Enable KG Neo4j'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'kg_neo4j_enabled');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'neo4j_uri', 'bolt://127.0.0.1:7687', 'Neo4j Bolt URI'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'neo4j_uri');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'neo4j_user', 'neo4j', 'Neo4j username'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'neo4j_user');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'neo4j_password', '', 'Neo4j password masked on read'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'neo4j_password');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'neo4j_database', 'neo4j', 'Neo4j database name'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'neo4j_database');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'kg_reconcile_enabled', '0', 'Enable KG reconcile'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'kg_reconcile_enabled');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'kg_reconcile_interval_ms', '21600000', 'KG reconcile interval ms'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'kg_reconcile_interval_ms');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'kg_semantic_min_sim', '0.72', 'Semantic min similarity'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'kg_semantic_min_sim');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'kg_neo4j_batch', '150', 'Neo4j batch size'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'kg_neo4j_batch');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'kg_last_test_status', '', 'Neo4j last test status'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'kg_last_test_status');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'kg_last_test_at', '', 'Neo4j last test time'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'kg_last_test_at');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'kg_last_test_message', '', 'Neo4j last test message'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'kg_last_test_message');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'kg_last_node_count', '', 'Neo4j last node count'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'kg_last_node_count');

INSERT INTO `system_config` (`config_key`, `config_value`, `description`)
SELECT 'kg_last_relation_count', '', 'Neo4j last relation count'
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `config_key` = 'kg_last_relation_count');
