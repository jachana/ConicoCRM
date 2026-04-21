# Conico Project

## Execution

When executing implementation plans, always use **superpowers:subagent-driven-development** (never superpowers:executing-plans or inline execution).
# Project Rules

## Tool & Command Policy
- **Permission Handling**: Do not ask for permission for routine read, test, or build commands.
- **Authorized Commands**: 
  - `npm test`
  - `git status`
  - `ls`
- **Confirmation Required**: Always ask before running destructive commands like `rm` or `git reset --hard`.
CLAUDE_CODE_DISABLE_1M_CONTEXT=1
keep context lower than 300k