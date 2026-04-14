import eslintConfigXo from 'eslint-config-xo';

const config = [
	...eslintConfigXo(),
	{
		files: ['src/index.js'],
		rules: {
			'unicorn/prefer-event-target': 'off',
		},
	},
];

export default config;
