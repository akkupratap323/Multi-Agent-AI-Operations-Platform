#!/usr/bin/env node

/**
 * GitHub Profile Briefing
 * Comprehensive analysis of your GitHub profile using Personal Access Token
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_API = 'https://api.github.com';

async function fetchGitHub(endpoint) {
  try {
    const response = await fetch(`${GITHUB_API}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch ${endpoint}:`, error.message);
    return null;
  }
}

async function getProfileInfo() {
  console.log('📊 Fetching GitHub Profile Information...\n');

  const user = await fetchGitHub('/user');

  if (!user) {
    console.log('❌ Could not fetch profile');
    return;
  }

  console.log('👤 PROFILE INFORMATION');
  console.log('═'.repeat(60));
  console.log(`Name: ${user.name || 'Not set'}`);
  console.log(`Username: @${user.login}`);
  console.log(`Email: ${user.email || 'Not public'}`);
  console.log(`Bio: ${user.bio || 'No bio'}`);
  console.log(`Location: ${user.location || 'Not set'}`);
  console.log(`Company: ${user.company || 'Not set'}`);
  console.log(`Blog/Website: ${user.blog || 'None'}`);
  console.log(`Twitter: ${user.twitter_username ? '@' + user.twitter_username : 'Not linked'}`);
  console.log(`\nAccount Created: ${new Date(user.created_at).toLocaleDateString()}`);
  console.log(`Account Type: ${user.type}`);
  console.log(`Profile URL: ${user.html_url}`);
  console.log(`\n📈 Stats:`);
  console.log(`  • ${user.public_repos} public repositories`);
  console.log(`  • ${user.public_gists} public gists`);
  console.log(`  • ${user.followers} followers`);
  console.log(`  • ${user.following} following`);
  console.log('');

  return user;
}

async function getRepositories(username) {
  console.log('📦 REPOSITORIES');
  console.log('═'.repeat(60));

  const repos = await fetchGitHub(`/users/${username}/repos?sort=updated&per_page=100`);

  if (!repos || repos.length === 0) {
    console.log('No repositories found');
    return;
  }

  console.log(`Total Repositories: ${repos.length}\n`);

  // Categorize repos
  const ownRepos = repos.filter(r => !r.fork);
  const forkedRepos = repos.filter(r => r.fork);
  const privateRepos = repos.filter(r => r.private);

  console.log(`📊 Breakdown:`);
  console.log(`  • ${ownRepos.length} original repos`);
  console.log(`  • ${forkedRepos.length} forked repos`);
  console.log(`  • ${privateRepos.length} private repos`);

  // Language stats
  const languages = {};
  repos.forEach(repo => {
    if (repo.language) {
      languages[repo.language] = (languages[repo.language] || 0) + 1;
    }
  });

  console.log(`\n💻 Top Languages:`);
  Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([lang, count]) => {
      console.log(`  • ${lang}: ${count} repos`);
    });

  // Most starred repos
  const starred = ownRepos
    .filter(r => r.stargazers_count > 0)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 5);

  if (starred.length > 0) {
    console.log(`\n⭐ Most Starred Repos:`);
    starred.forEach(repo => {
      console.log(`  • ${repo.name} (${repo.stargazers_count} ⭐, ${repo.forks_count} forks)`);
      if (repo.description) {
        console.log(`    ${repo.description.substring(0, 80)}${repo.description.length > 80 ? '...' : ''}`);
      }
    });
  }

  // Recently updated
  console.log(`\n🕒 Recently Updated:`);
  repos.slice(0, 5).forEach(repo => {
    const updated = new Date(repo.updated_at);
    const daysAgo = Math.floor((Date.now() - updated) / (1000 * 60 * 60 * 24));
    console.log(`  • ${repo.name} (${daysAgo}d ago)`);
    console.log(`    ${repo.private ? '🔒 Private' : '🔓 Public'} | ${repo.language || 'No language'} | ${repo.stargazers_count} ⭐`);
  });

  console.log('');
  return repos;
}

async function getRecentActivity(username) {
  console.log('⚡ RECENT ACTIVITY (Last 30 events)');
  console.log('═'.repeat(60));

  const events = await fetchGitHub(`/users/${username}/events?per_page=30`);

  if (!events || events.length === 0) {
    console.log('No recent activity found');
    return;
  }

  const eventCounts = {};
  events.forEach(event => {
    eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
  });

  console.log('📊 Activity Summary:');
  Object.entries(eventCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      const emoji = {
        'PushEvent': '📤',
        'CreateEvent': '🆕',
        'WatchEvent': '⭐',
        'ForkEvent': '🔱',
        'IssuesEvent': '🐛',
        'PullRequestEvent': '🔀',
        'IssueCommentEvent': '💬',
        'DeleteEvent': '🗑️',
        'PublicEvent': '🔓'
      }[type] || '📌';

      console.log(`  ${emoji} ${type}: ${count}`);
    });

  // Recent pushes
  const pushEvents = events.filter(e => e.type === 'PushEvent').slice(0, 5);
  if (pushEvents.length > 0) {
    console.log(`\n📤 Recent Pushes:`);
    pushEvents.forEach(event => {
      const date = new Date(event.created_at);
      const repo = event.repo.name;
      const commits = event.payload.commits?.length || 0;
      console.log(`  • ${repo} (${commits} commit${commits !== 1 ? 's' : ''}) - ${date.toLocaleDateString()}`);
    });
  }

  // Recent PRs
  const prEvents = events.filter(e => e.type === 'PullRequestEvent').slice(0, 5);
  if (prEvents.length > 0) {
    console.log(`\n🔀 Recent Pull Requests:`);
    prEvents.forEach(event => {
      const action = event.payload.action;
      const pr = event.payload.pull_request;
      console.log(`  • ${action} PR #${pr.number} in ${event.repo.name}`);
      console.log(`    "${pr.title}"`);
    });
  }

  console.log('');
}

async function getOrganizations(username) {
  console.log('🏢 ORGANIZATIONS');
  console.log('═'.repeat(60));

  const orgs = await fetchGitHub(`/users/${username}/orgs`);

  if (!orgs || orgs.length === 0) {
    console.log('Not a member of any organizations\n');
    return;
  }

  console.log(`Member of ${orgs.length} organization(s):\n`);
  orgs.forEach(org => {
    console.log(`  • ${org.login}`);
    console.log(`    ${org.description || 'No description'}`);
  });

  console.log('');
}

async function getContributions(username) {
  console.log('📈 CONTRIBUTION STATS');
  console.log('═'.repeat(60));

  // Get contribution data via GraphQL (simplified)
  const today = new Date();
  const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

  console.log(`Analyzing contributions from ${oneYearAgo.toLocaleDateString()} to ${today.toLocaleDateString()}`);

  // Get events as proxy for contribution activity
  const events = await fetchGitHub(`/users/${username}/events?per_page=100`);

  if (events) {
    const recentDays = 30;
    const recentDate = new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000);
    const recentEvents = events.filter(e => new Date(e.created_at) > recentDate);

    console.log(`\n📅 Last ${recentDays} days:`);
    console.log(`  • ${recentEvents.length} total events`);

    const pushes = recentEvents.filter(e => e.type === 'PushEvent');
    const totalCommits = pushes.reduce((sum, e) => sum + (e.payload.commits?.length || 0), 0);
    console.log(`  • ${totalCommits} commits pushed`);

    const prs = recentEvents.filter(e => e.type === 'PullRequestEvent');
    console.log(`  • ${prs.length} pull request actions`);

    const issues = recentEvents.filter(e => e.type === 'IssuesEvent');
    console.log(`  • ${issues.length} issue actions`);
  }

  console.log('');
}

async function getStarredRepos(username) {
  console.log('⭐ STARRED REPOSITORIES');
  console.log('═'.repeat(60));

  const starred = await fetchGitHub(`/users/${username}/starred?per_page=10`);

  if (!starred || starred.length === 0) {
    console.log('No starred repositories\n');
    return;
  }

  console.log(`Recently starred repositories:\n`);
  starred.slice(0, 5).forEach(repo => {
    console.log(`  ⭐ ${repo.full_name} (${repo.stargazers_count} ⭐)`);
    if (repo.description) {
      console.log(`     ${repo.description.substring(0, 80)}${repo.description.length > 80 ? '...' : ''}`);
    }
    console.log(`     ${repo.html_url}`);
  });

  console.log('');
}

async function getRateLimitInfo() {
  const rateLimit = await fetchGitHub('/rate_limit');

  if (rateLimit) {
    const core = rateLimit.resources.core;
    const reset = new Date(core.reset * 1000);

    console.log('🔑 API RATE LIMIT INFO');
    console.log('═'.repeat(60));
    console.log(`Remaining: ${core.remaining} / ${core.limit}`);
    console.log(`Resets at: ${reset.toLocaleString()}`);
    console.log('');
  }
}

async function main() {
  console.log('\n');
  console.log('🚀 GitHub Profile Briefing');
  console.log('═'.repeat(60));
  console.log('Analyzing your GitHub profile...\n');

  const user = await getProfileInfo();

  if (!user) {
    console.log('❌ Failed to fetch profile information');
    return;
  }

  const username = user.login;

  await getRepositories(username);
  await getRecentActivity(username);
  await getOrganizations(username);
  await getContributions(username);
  await getStarredRepos(username);
  await getRateLimitInfo();

  console.log('✨ Briefing complete!');
  console.log('═'.repeat(60));
}

main().catch(console.error);
