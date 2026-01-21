export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation
        'style', // Formatting, missing semicolons, etc.
        'refactor', // Code refactoring
        'perf', // Performance improvements
        'test', // Adding tests
        'chore', // Maintenance
        'ci', // CI/CD changes
        'build', // Build system changes
        'revert', // Revert previous commit
      ],
    ],
    'subject-case': [0], // Disable subject case check
    'body-max-line-length': [0], // Disable body line length limit
  },
};
