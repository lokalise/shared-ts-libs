module.exports = {
	extends: [
		// We currently re-use all the same rules so might as well just extend it,
		// but we do want to keep the config separate in case we want to change just for backends.
		'./shared-package.cjs',
		// We're re-extending tests config to make sure it's the last config applied
		'./tests.cjs',
	],
}
