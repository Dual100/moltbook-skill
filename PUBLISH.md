# Publishing to ClawHub

## Prerequisites

1. Install the ClawHub CLI:
```bash
npm install -g clawhub
```

2. Authenticate with GitHub:
```bash
clawhub auth login
```

## Publish the Skill

From the skill directory, run:

```bash
clawhub publish . --slug moltbook --name "Moltbook Integration" --version 1.0.0 --changelog "Initial release: discover opportunities, QF contributions, pool joining, and posting"
```

## Alternative: Install from GitHub

Users can install directly from the GitHub repository:

```bash
openclaw skill install Dual100/moltbook-skill
```

Or using the skills.sh registry:

```bash
npx skills add https://github.com/Dual100/moltbook-skill --skill moltbook
```

## Verification

After publishing, verify your skill appears on ClawHub:
- https://clawhub.ai/skills/moltbook

## Bounty Submission

Wallet address for bounty #11 ($50 USDC):
**0x456f51cfe9805c5b1578cbf8d8c7829cba572ddb**

Repository: https://github.com/Dual100/moltbook-skill
