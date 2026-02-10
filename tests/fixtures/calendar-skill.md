---
id: calendar-sync
name: Calendar Sync
version: 1.0.0
author: team
---

# Calendar Sync Skill

This skill synchronizes calendar events between Google Calendar and the local task system.

## Capabilities

- Read events from Google Calendar API
- Create and update local task entries based on calendar events
- Send Slack notifications for upcoming meetings

## Tools Used

- `google_calendar_read` — Fetch events from Google Calendar
- `task_create` — Create a new task
- `task_update` — Update an existing task
- `slack_send_message` — Send notifications to Slack

## Data Access

- Reads from Google Calendar API (calendar.google.com)
- Writes to local task database at `./data/tasks.json`
- Reads config from `./config/calendar.yaml`
