-- T3 Code never grants review:write to pairing credentials, so a stored scope list naming it fails every catalog token request.
UPDATE `environments`
SET `browser_token_scopes_json` = (
	SELECT json_group_array(`value`)
	FROM json_each(`environments`.`browser_token_scopes_json`)
	WHERE `value` != 'review:write'
)
WHERE EXISTS (
	SELECT 1
	FROM json_each(`environments`.`browser_token_scopes_json`)
	WHERE `value` = 'review:write'
);
