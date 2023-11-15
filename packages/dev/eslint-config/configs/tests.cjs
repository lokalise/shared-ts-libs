module.exports = {
	overrides: [
		{
			files: ['*.test.{ts,tsx}', '*.spec.{ts,tsx}', 'test/**/*'],
			rules: {
				'@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
				'@typescript-eslint/no-non-null-assertion': 'off',
				'@typescript-eslint/no-unsafe-argument': 'off',
				'@typescript-eslint/no-explicit-any': 'off',
				'@typescript-eslint/no-unsafe-return': 'off',
				'@typescript-eslint/no-unsafe-assignment': 'off',
				'@typescript-eslint/no-unsafe-member-access': 'off',
				'@typescript-eslint/no-unsafe-call': 'off',
				'max-statements': ['off'],
				'i18next/no-literal-string': 'off',
			},
		},
	],
}
