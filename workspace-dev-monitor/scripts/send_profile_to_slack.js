#!/usr/bin/env node

/**
 * Send GitHub Profile Briefing to Slack
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_API = 'https://api.github.com';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = 'C0AFZ4RNNM6';

async function fetchGitHub(endpoint) {
  const response = await fetch(`${GITHUB_API}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json'
    }
  });
  return await response.json();
}

async function generateBriefing() {
  const user = await fetchGitHub('/user');
  const repos = await fetchGitHub(`/users/${user.login}/repos?sort=updated&per_page=100`);
  const events = await fetchGitHub(`/users/${user.login}/events?per_page=100`);

  // Calculate stats
  const ownRepos = repos.filter(r => !r.fork);
  const languages = {};
  repos.forEach(repo => {
    if (repo.language) {
      languages[repo.language] = (languages[repo.language] || 0) + 1;
    }
  });

  const topLanguages = Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const starredRepos = ownRepos
    .filter(r => r.stargazers_count > 0)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 3);

  // Recent activity
  const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentEvents = events.filter(e => new Date(e.created_at) > recentDate);

  const eventCounts = {};
  recentEvents.forEach(event => {
    eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
  });

  // Build message
  let message = `*🚀 GitHub Profile Briefing*\n\n`;

  message += `*👤 ${user.name || user.login}* (@${user.login})\n`;
  if (user.bio) message += `_${user.bio}_\n`;
  message += `🌐 ${user.html_url}\n`;
  if (user.blog) message += `🔗 ${user.blog}\n`;
  message += `\n`;

  message += `*📊 Overview*\n`;
  message += `• ${user.public_repos} public repos (${ownRepos.length} original, ${repos.length - ownRepos.length} forked)\n`;
  message += `• ${user.followers} followers | ${user.following} following\n`;
  message += `• Account created: ${new Date(user.created_at).toLocaleDateString()}\n`;
  message += `\n`;

  message += `*💻 Top Languages*\n`;
  topLanguages.forEach(([lang, count]) => {
    message += `• ${lang}: ${count} repos\n`;
  });
  message += `\n`;

  if (starredRepos.length > 0) {
    message += `*⭐ Most Starred Projects*\n`;
    starredRepos.forEach(repo => {
      message += `• ${repo.name} (${repo.stargazers_count} ⭐)\n`;
    });
    message += `\n`;
  }

  message += `*⚡ Recent Activity (Last 30 days)*\n`;
  message += `• ${recentEvents.length} total events\n`;
  Object.entries(eventCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([type, count]) => {
      const name = type.replace('Event', '');
      message += `• ${count} ${name}${count > 1 ? 's' : ''}\n`;
    });

  const pushes = recentEvents.filter(e => e.type === 'PushEvent');
  const totalCommits = pushes.reduce((sum, e) => sum + (e.payload.commits?.length || 0), 0);
  message += `• ${totalCommits} commits pushed\n`;

  message += `\n_Generated: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} IST_`;

  return message;
}

async function sendToSlack(message) {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      channel: SLACK_CHANNEL,
      text: message
    })
  });

  const data = await response.json();
  if (data.ok) {
    console.log('✅ Profile briefing sent to Slack!');
  } else {
    console.log('⚠️  Failed to send:', data.error);
  }
}

async function main() {
  console.log('📊 Generating GitHub profile briefing...\n');

  const briefing = await generateBriefing();

  console.log(briefing);
  console.log('\n' + '─'.repeat(60));

  await sendToSlack(briefing);
}

main().catch(console.error);
