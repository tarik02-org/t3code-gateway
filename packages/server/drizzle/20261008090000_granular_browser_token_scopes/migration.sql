-- T3 Code split its broad scopes into granular ones and no longer infers the children,
-- so a stored list keeps what it granted only with each broad scope's children added.
WITH `implied` (`parent`, `child`) AS (
	VALUES
		('orchestration:read', 'filesystem:read'),
		('orchestration:read', 'diagnostics:read'),
		('orchestration:operate', 'settings:write'),
		('orchestration:operate', 'providers:manage'),
		('orchestration:operate', 'environment:maintain'),
		('orchestration:operate', 'preview:operate'),
		('orchestration:operate', 'source-control:write'),
		('orchestration:operate', 'filesystem:write'),
		('terminal:operate', 'terminal:read')
)
UPDATE `environments`
SET `browser_token_scopes_json` = (
	SELECT json_group_array(`scope`)
	FROM (
		SELECT `value` AS `scope`
		FROM json_each(`environments`.`browser_token_scopes_json`)
		UNION
		SELECT `implied`.`child`
		FROM `implied`
		JOIN json_each(`environments`.`browser_token_scopes_json`) AS `granted`
			ON `granted`.`value` = `implied`.`parent`
	)
);
