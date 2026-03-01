/**
 * PM2 Ecosystem Config — Incident Commander
 *
 * Manages 3 long-running processes:
 *   1. monitor    — polls AWS every 60s, triggers incident pipeline
 *   2. slack-bot  — polls Slack #incidents for commands every 3s
 *   3. scheduler  — cron jobs for reports and escalation checks
 *
 * Usage:
 *   pm2 start ecosystem.config.js   # start all
 *   pm2 stop ecosystem.config.js    # stop all
 *   pm2 restart all                 # restart all
 *   pm2 logs                        # tail all logs
 *   pm2 monit                       # live dashboard
 */

module.exports = {
  apps: [
    {
      name: 'ic-monitor',
      script: 'scripts/monitor.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/monitor-error.log',
      out_file: 'logs/monitor-out.log',
      merge_logs: true
    },
    {
      name: 'ic-slack-bot',
      script: 'scripts/slack_bot.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/slack-bot-error.log',
      out_file: 'logs/slack-bot-out.log',
      merge_logs: true
    },
    {
      name: 'ic-scheduler',
      script: 'scripts/scheduler.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '150M',
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/scheduler-error.log',
      out_file: 'logs/scheduler-out.log',
      merge_logs: true
    }
  ]
};
