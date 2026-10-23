# Daily Tarot V3.2 — GMT+3 timezone-only update

This updates the working V3.1 website to reset cards at 00:00 (UTC+03:00) rather than Pacific midnight. No reward, image, username, styling, or admin functionality is changed.


# Android installation


1. Back up important draw records before running SQL migrations.

2. In Supabase -> your existing project -> SQL Editor -> New query, paste and run the complete migration_gmt3.sql. Do not rerun migration_v3.sql or migration_v3_1.sql.

3. On GitHub, replace only app.js, admin.js, index.html, and admin.html with files from this ZIP. Commit the changes. Render redeploys the static site.

4. Keep your existing, working config.js, style.css, Supabase project, and storage bucket unchanged.

5. Refresh the public website (possibly an incognito tab) and the admin page. Confirm the reset displays GMT+3 and the admin history timestamps use GMT+3.


Historical draw dates

Existing draw records are preserved exactly, including draw_day values originally recorded under Pacific time. The admin table labels this column Stored draw day to avoid implying old values were created in GMT+3. The timestamps themselves are displayed correctly in GMT+3 and UTC.


Switching the timezone mid-day changes the definition of the current draw date; a few members might temporarily have an additional draw or a different lockout window around the switchover. For a perfectly clean transition, deploy during a planned quiet period and tell members when the daily reset changes.
