# RanchOS User Manual

Version date: April 9, 2026

## 1. What RanchOS Is

RanchOS is a ranch operations workspace for orchard teams. It combines mapping, tasks, irrigation, scouting, compliance, labor, harvest tracking, intelligence recommendations, and notification operations in one web app tied to a live organization and ranch database.

The current product is strongest in these day-to-day operational workflows:

- Account creation and onboarding
- Ranch and block mapping
- Task management
- Irrigation setup and event tracking
- Pest scouting logs
- Compliance records and DPR-ready export
- Team roster and labor logging
- Harvest logging and handler ticket reconciliation
- Intelligence recommendations
- Notification preferences, delivery queue health, and delivery history

Some areas are present but should be treated as early-stage or preview surfaces:

- Frost settings
- Visual themes
- Mobile offline-first workflows
- Deep billing verification

## 2. Before You Begin

Before you start, have the following ready:

- A work email address
- Your ranch or company name
- The name of your first ranch
- County and approximate acreage
- Optional ranch GPS center coordinates
- Optional ranch boundary outline
- Names of crew members you want to add first

If you do not have GPS coordinates yet, you can still start. RanchOS lets you set or refine map information later in Settings.

## 3. First-Time Setup

### 3.1 Create Your Account

1. Open the RanchOS sign-up page.
2. Enter your full name.
3. Enter your work email.
4. Create a password.
5. Click **Start Free Trial**.
6. RanchOS sends you to onboarding.

### 3.2 Log In Later

If you already have an account:

1. Open the login page.
2. Enter your email and password.
3. Click **Sign In**.
4. RanchOS automatically routes you to onboarding if setup is incomplete, or to the dashboard if setup is already finished.

## 4. Onboarding Walkthrough

Onboarding has three steps.

### 4.1 Step 1: Set Up Your Organization

In this step, you create the top-level workspace.

1. Enter your organization name.
2. Choose your primary crop:
   - Almonds
   - Citrus
   - Both
3. Confirm your timezone.
4. Click **Next Step**.

What this does:

- Creates the organization-level identity for your workspace
- Sets the crop context used by some workflows and recommendations

### 4.2 Step 2: Add Your Profile and First Ranch

In this step, you create the first ranch attached to your organization.

1. Enter your full name.
2. Enter your ranch name.
3. Select the county.
4. Enter approximate acreage.
5. Optionally enter the ranch center latitude and longitude.
6. Optionally click the map to set the ranch center visually.
7. Optionally draw the ranch boundary on the map.
8. Click **Next Step**.

What this does:

- Creates your first ranch
- Gives maps a correct starting location
- Enables ranch coverage and boundary-aware mapping later

Tip:

If you skip the map center or boundary during onboarding, RanchOS still works. You can add both later in **Settings**.

### 4.3 Step 3: Confirm the Trial Workspace

1. Choose your preferred language:
   - English
   - Spanish
2. Optionally add a phone number.
3. Review the summary:
   - Organization
   - First ranch
   - Map center
   - Boundary captured or not
   - Trial plan
4. Click **Go to Dashboard**.

What this does:

- Creates the organization
- Creates the owner profile
- Creates the first ranch
- Starts the starter trial workspace

## 5. Dashboard Home

The dashboard is your control center. It gives you a live summary of the current organization and ranch.

### 5.1 What You See on the Dashboard

- Organization name and plan status
- Total active blocks
- Mapped acres
- Tree count
- Ranch coverage percentage
- Open tasks
- In-progress tasks
- Overdue tasks
- Tasks due today
- Live block overview map

### 5.2 How to Use It

1. Open the dashboard after logging in.
2. Review the top summary cards first.
3. Check the task summary for urgent work.
4. Use the block overview map to confirm your ranch geometry and block distribution.
5. Move into the operational area you need next:
   - Blocks
   - Tasks
   - Irrigation
   - Scouting
   - Compliance
   - Labor
   - Harvest
   - Intelligence
   - Settings

Best use:

Use the dashboard as a morning review page rather than a data entry page.

## 6. Blocks

The **Blocks** area is where you manage the orchard layout RanchOS uses everywhere else.

### 6.1 Why Blocks Matter

Blocks are the foundation for:

- Irrigation
- Scouting
- Compliance records
- Harvest events
- Labor linkage
- Intelligence recommendations

### 6.2 What You Can Do

- View all live blocks
- See a ranch map with block geometry
- Create a new block
- Edit a block
- Delete a block
- Review organic counts and mapped acreage
- Review ranch coverage against the ranch boundary

### 6.3 Create Your First Block

1. Open **Blocks**.
2. Click **New Block**.
3. Fill in the block details:
   - Name
   - Crop type
   - Variety
   - Acreage
   - Tree count
   - Year planted
   - Rootstock
   - Irrigation type
   - Organic flag and organic since date
   - APN
   - Water district
   - GSA name
   - Notes
4. Draw or assign block geometry if needed.
5. Save the block.

### 6.4 Edit or Delete a Block

1. Open **Blocks**.
2. Find the block in the live block inventory.
3. Click **Edit** to update the block.
4. Click **Delete** to remove it.

Important:

Deleting a block can affect later workflows that rely on block linkage, so review before removing active blocks.

### 6.5 Coverage and Mapping Health

If you saved a ranch boundary, the Blocks page also shows:

- Percent of ranch acreage mapped by blocks
- Mapped acres versus boundary acres
- Remaining uncovered acreage

This is especially useful when cleaning up geometry after onboarding.

## 7. Tasks

The **Tasks** area manages operational work across your ranch.

### 7.1 What You Can Do

- Create tasks
- Assign due dates
- Set status
- Set priority
- Link tasks to one or more blocks
- View all tasks
- Filter tasks by status
- Edit existing tasks
- Delete existing tasks

### 7.2 Task Statuses

RanchOS shows tasks in these main states:

- Open
- In progress
- Overdue
- Completed

### 7.3 Create a Task

1. Open **Tasks**.
2. Click **New Task**.
3. Enter:
   - Task title
   - Task type
   - Description
   - Due date
   - Status
   - Priority
   - Block assignments
4. Click **Create task**.
5. RanchOS sends you to the task detail page.

### 7.4 Review or Update a Task

1. Open **Tasks**.
2. Click any task in the live task list.
3. Update the fields you need.
4. Save your changes.
5. Delete the task if it should be removed entirely.

### 7.5 Filter the Task List

On the Tasks page, use the filter chips to switch between:

- All tasks
- Open
- In progress
- Overdue
- Completed

Best use:

Use block assignment consistently. That keeps downstream intelligence and reporting grounded in the actual ranch map.

## 8. Irrigation

The **Irrigation** page manages block-level irrigation assumptions and irrigation events.

### 8.1 What You Can Do

- Save irrigation configuration for each block
- Select among available blocks
- Create irrigation events
- Track event status
- Review configured blocks
- Review upcoming, completed, and problem events
- See linked CIMIS station counts in the dashboard

### 8.2 Set Up Irrigation for a Block

1. Open **Irrigation**.
2. Use the block selector to choose a block.
3. Enter or update the block irrigation configuration.
4. Save the irrigation config.

Expected use:

Do this once per block, then update when system assumptions change.

### 8.3 Create an Irrigation Event

1. Stay on the Irrigation page.
2. Choose the target block.
3. Enter the irrigation event details.
4. Set the scheduled date.
5. Save or create the event.

### 8.4 Update Irrigation Event Status

You can move irrigation events through operational states such as:

- Scheduled
- Running
- Completed
- Problem
- Skipped

Use this to maintain accurate operational history and keep later insights honest.

## 9. Scouting

The **Scouting** page is where you log pest and crop observations by block.

### 9.1 What You Can Do

- Create scouting logs
- Link observations to a block
- Choose a pest species
- Record a rating
- Add notes
- Edit logs
- Delete logs
- Review recent scouting activity
- Surface high-risk pest observations for intelligence and compliance workflows

### 9.2 Create a Scouting Log

1. Open **Scouting**.
2. Choose a block.
3. Choose the pest species.
4. Enter the scouting date and time.
5. Set the rating.
6. Add notes or context.
7. Save the log.

### 9.3 Rating Levels

Scouting ratings progress from low concern to action-needed, including:

- None or clear
- Low
- Moderate
- High
- Action

### 9.4 Edit or Delete a Log

1. Open **Scouting**.
2. Find the log in recent entries.
3. Click **Edit** to revise it.
4. Click the delete action to remove it if needed.

Best use:

Log scouting at the block level as consistently as possible. This makes recommendations more accurate later.

## 10. Compliance

The **Compliance** page combines a product catalog with live application records.

### 10.1 What You Can Do

- Create product catalog entries
- Record pesticide or application events
- Link records to blocks
- Link application records to scouting logs
- Track REI and PHI impacts
- Flag organic handling
- Mark certifier notifications
- Mark records as verified
- Export DPR CSV data

### 10.2 Add a Product

1. Open **Compliance**.
2. In the **Add product** section, enter:
   - Product name
   - Manufacturer
   - EPA registration number
   - Formulation
   - REI hours
   - PHI days
   - Target pests
   - Restricted use flag
   - OMRI listed flag
   - CDFA organic approved flag
3. Click **Create product**.

### 10.3 Log an Application Record

1. Open **Compliance**.
2. In **Log application record**, enter:
   - Block
   - Record type
   - Applicator name
   - Applicator license
   - Product or manual product entry
   - Applied date
   - Acres treated
   - Rate per acre
   - Rate unit
   - Total product used
   - Total product unit
   - Water volume
   - Start time
   - End time
   - Target scouting log
   - Target pest
   - Equipment used
   - Certifier notified
   - Verified record
   - Organic approval confirmed
   - Notes
3. Click **Create application record**.

### 10.4 Review Compliance Status

The page highlights:

- Active REI records
- Active PHI records
- Organic block handling
- Verified versus unverified records
- Recent application history

### 10.5 Export DPR CSV

1. Open **Compliance**.
2. Click **Export DPR CSV**.
3. Save the exported file for reporting or downstream review.

## 11. Team Settings and Labor

Team setup and labor logging work together.

### 11.1 Team Settings: Build the Crew Roster

Open **Settings > Team** to manage crew members.

You can:

- Create crew members
- Link a crew member to an app user profile
- Track employee ID
- Track phone number
- Track hire date
- Set the position
- Set pay type
- Set hourly rate for hourly workers
- Mark active or inactive status
- Mark H-2A workers
- Track H-2A disclaimer acknowledgment

### 11.2 Add a Crew Member

1. Open **Settings > Team**.
2. Click into the crew form.
3. Enter:
   - Full name
   - Employee ID
   - Linked app user if available
   - Phone
   - Hire date
   - Position
   - Pay type
   - Hourly rate if hourly
   - Active status
   - H-2A status
   - H-2A disclaimer acknowledged
4. Click **Create crew member**.

### 11.3 Labor: Log Work

Once you have active crew members, open **Labor**.

You can:

- Log work by crew member
- Link work to a block
- Link work to a task
- Track hourly labor
- Track piece-rate labor
- Track salary-based gross pay
- Add notes
- Edit prior entries
- Review estimated hours and gross pay before saving

### 11.4 Create a Labor Entry

1. Open **Labor**.
2. Choose a crew member.
3. Enter the work date.
4. Optionally link a block.
5. Optionally link a task.
6. Enter pay details depending on the worker type:
   - Hourly: hours worked, clock in, clock out
   - Piece-rate: piece-rate unit, quantity, rate per unit
   - Salary: gross pay
7. Add notes.
8. Click **Create labor entry**.

### 11.5 Review Recent Labor Entries

The Labor page shows:

- Crew member
- Pay type
- Work date
- Block link
- Task link
- Hours worked
- Gross pay
- Piece-rate details
- Clock in and clock out times
- Notes

## 12. Harvest

The **Harvest** page is the main place for harvest operations and handler ticket reconciliation.

### 12.1 What You Can Do

- Create harvest events
- Edit harvest events
- Link harvest events to blocks
- Link harvest events to crew members
- Track weights, bins, and load details
- Track quality notes
- Import handler tickets
- Reconcile handler tickets against harvest events
- Export harvest CSV data

### 12.2 Create a Harvest Event

1. Open **Harvest**.
2. Choose the block.
3. Enter the harvest date.
4. Choose the harvest method.
5. Enter available harvest details:
   - Total pounds
   - Total bins
   - Bin weight
   - Picker count
   - Handler name
   - Load ticket
   - Hulled weight
   - Hull split percentage
   - Brix
   - Acid ratio
   - Handler ticket reconciled flag
   - Crew members on the event
   - Notes
6. Click **Create harvest event**.

### 12.3 Reconcile Handler Tickets

1. Open **Harvest**.
2. Use the handler ticket import panel.
3. Import available handler ticket data.
4. Compare imported tickets to existing harvest events.
5. Review:
   - Matched tickets
   - Unmatched tickets
   - Discrepancies
   - Unreconciled tickets
6. Update harvest events or reconciliation status as needed.

### 12.4 Export Harvest Data

1. Open **Harvest**.
2. Click **Export CSV**.
3. Save the export for your internal process or downstream reporting.

## 13. Intelligence

The **Intelligence** page turns live records into operational recommendations.

### 13.1 What Intelligence Uses

Recommendations are built from data already inside RanchOS, including:

- Tasks
- Scouting logs
- Irrigation records
- Compliance records
- Seasonal and timing signals

### 13.2 What You Can Do

- Review active recommendations
- See urgency level
- See recommendation category
- See linked block context
- Mark a recommendation as acted on
- Dismiss a recommendation
- Watch recommendations refresh from live org events

### 13.3 Use the Page Day to Day

1. Open **Intelligence**.
2. Review the top summary cards:
   - Urgent
   - Warning
   - Task pressure
   - Pest pressure
   - Water and compliance attention
   - Seasonal timing
3. Read the live recommendations list.
4. Open the linked operational page if follow-up is needed.
5. Click **Mark acted** after taking action.
6. Click **Dismiss** if the recommendation no longer needs attention.

Best use:

Treat Intelligence as a prioritization layer, not a replacement for entering accurate field data.

## 14. Notifications

The **Settings > Notifications** page manages delivery preferences and notification operations history.

### 14.1 What You Can Do

- Turn push notifications on or off
- Turn email notifications on or off
- Restrict delivery to urgent items only
- Enable or disable quiet hours
- Set quiet hours start and end times
- Review queue health
- Review recent delivery history
- Filter history by status and reason group
- Watch queue and history update live while workers process deliveries

### 14.2 Update Notification Preferences

1. Open **Settings > Notifications**.
2. Review the current delivery settings.
3. Turn on or off:
   - Push enabled
   - Email enabled
   - Urgent only
   - Quiet hours enabled
4. If quiet hours are enabled, choose:
   - Start time
   - End time
5. Save the settings.

### 14.3 Review Queue Health

The page summarizes delivery state across the persisted outbox, including:

- Pending
- Deferred
- Sent
- Failed
- Canceled
- Receipt confirmed
- Sent awaiting receipt
- Recipient counts
- Profiles with push configured

### 14.4 Review Delivery History

Use the history filters to focus on:

- All statuses
- Failed
- Sent
- Pending
- Deferred
- Canceled

You can also filter by reason groups such as:

- Failed receipts
- Receipt timeouts
- Dead token churn or device issues
- Receipt confirmed

### 14.5 Live Refresh Behavior

This page updates live from org events. When notification sender and receipt workers are running, the queue health and recent delivery history refresh without a manual page reload.

## 15. Settings

The main **Settings** page covers ranch mapping and links to other setup areas.

### 15.1 Ranch Map Setup

Use Settings to:

- Save ranch center coordinates
- Save the preferred map viewport
- Draw or update the ranch boundary
- Review mapped block coverage
- Review topology and overlap information

### 15.2 Update the Ranch Center

1. Open **Settings**.
2. Enter latitude and longitude manually, or click the ranch center map.
3. Pan or zoom the map if you want a preferred saved viewport.
4. Click **Save ranch map**.

### 15.3 Update the Ranch Boundary

1. Open **Settings**.
2. Use the ranch boundary editor.
3. Draw or refine the ranch footprint.
4. Click **Save ranch map**.

### 15.4 Review Mapping Health

Settings shows:

- Whether a center is saved
- Whether a viewport is saved
- Whether a boundary is saved
- Whether mapped blocks exist
- Boundary acres
- Uncovered acres
- Overlap pairs
- Overlap acres

## 16. Frost Settings

The **Settings > Frost** page is an early frost alert configuration surface.

Current visible controls include:

- Active monitoring toggle
- Warning broadcast threshold
- Critical danger threshold
- Dispatch roster display
- Send test alert button
- Save configuration button

Important note:

Treat Frost settings as an early-stage UI surface. Use it for orientation and planning, not as a fully verified production automation control center yet.

## 17. Visual Themes

The **Themes** area lets users switch the app’s visual style.

### 17.1 What You Can Do

- Browse available themes
- Apply a theme
- Open a theme detail page

### 17.2 How Themes Work

1. Open **Themes**.
2. Review the available theme cards.
3. Click **Apply Theme** on the one you want.
4. RanchOS stores the selected theme in your browser local storage.

Important note:

Themes affect appearance only. They do not change your operational data.

## 18. Suggested First-Week Workflow

If you are starting from zero, this sequence works well:

### Day 1

1. Create your account.
2. Finish onboarding.
3. Save the ranch center and boundary if available.
4. Create your first blocks.

### Day 2

1. Add task types through normal task creation.
2. Create the initial task backlog.
3. Add crew members in Team settings.

### Day 3

1. Configure irrigation for key blocks.
2. Start logging irrigation events.
3. Log your first scouting observations.

### Day 4

1. Add commonly used compliance products.
2. Log the first application records.
3. Export a DPR CSV to confirm the workflow looks right.

### Day 5

1. Start logging labor entries.
2. Enter harvest events if harvest is active.
3. Import any handler tickets.
4. Review Intelligence recommendations.
5. Enable notification preferences.

## 19. Practical Tips

- Set up blocks early. Nearly every operational workflow becomes easier after blocks are in place.
- Keep the ranch boundary current so coverage metrics stay meaningful.
- Link tasks, labor, scouting, compliance, and harvest data back to blocks whenever possible.
- Keep crew active and inactive status current so labor entry forms stay clean.
- Use notes fields generously for field context, payroll context, organic handling notes, or reconciliation explanations.
- Review Intelligence daily only after your source data is reasonably current.
- Use the Notifications page to monitor delivery health, not just preference settings.

## 20. Current Scope and Limitations

As of this manual’s version date, these items are intentionally deferred or still early:

- Offline-first mobile database workflows
- Deep Stripe or billing verification
- Full frost automation maturity
- Deeper payroll export and labor compliance flows
- Full future-weather forecasting automation

That does not prevent normal use of the core web workflows listed earlier.

## 21. Quick Navigation Reference

- Dashboard: overall summary and live block overview
- Blocks: ranch block inventory and map
- Tasks: operational work tracking
- Irrigation: irrigation config and events
- Scouting: pest and field observations
- Compliance: product catalog, spray records, DPR export
- Labor: work logging and gross pay capture
- Harvest: harvest records and handler ticket reconciliation
- Intelligence: live recommendations
- Settings: ranch map, team, notifications, frost
- Themes: visual appearance options

## 22. Final Advice for New Users

The fastest way to get value from RanchOS is to build the map correctly, create blocks, and then keep all later records attached to those blocks. If you do that, the rest of the system becomes much more useful: coverage improves, logs stay searchable, recommendations make more sense, and exports are easier to trust.
