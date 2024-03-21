module.exports = {
	extends: [
		'./typescript.cjs',
		'@lokalise/frontend/core',
		'@lokalise/frontend/vitest',
		'@lokalise/frontend/typescript',
		'@lokalise/frontend/react',
		'@lokalise/frontend/localisation',
		'./tests.cjs',
		'plugin:@tanstack/eslint-plugin-query/recommended',
	],
	env: {
		browser: true,
		node: true,
	},
	rules: {
		'import/no-extraneous-dependencies': ['error', { packageDir: './' }],
	},
}
