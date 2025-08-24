/**
 * AutoTriage - AI-powered GitHub triage bot
 * © Daniel Chalmers 2025
 */

const fetch = require('node-fetch');
const { Octokit } = require('@octokit/rest');
const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

// Global constants
const AI_MODEL_FAST = 'gemini-2.5-flash';
const AI_MODEL_PRO = 'gemini-2.5-pro';
const DB_PATH = process.env.AUTOTRIAGE_DB_PATH;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
const [OWNER, REPO] = (GITHUB_REPOSITORY || '').split('/');
const SPECIFIC_ISSUES = process.env.ISSUE_NUMBERS ? process.env.ISSUE_NUMBERS.split(/\s+/).map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n)) : [];
const ENABLED = process.env.AUTOTRIAGE_ENABLED === 'true';

async function callGemini(prompt, model, issueNumber) {
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    reason: { type: "STRING", description: "Brief explanation of analysis and decision" },
                    comment: { type: "STRING", description: "Comment to post on the issue" },
                    labels: { type: "ARRAY", items: { type: "STRING" }, description: "Complete final label set for the issue" },
                    close: { type: "BOOLEAN", description: "Whether to close the issue" },
                    newTitle: { type: "STRING", description: "New title for the issue or pull request" },
                },
                required: ["reason", "labels"]
            },
            temperature: 0.0,
        }
    };

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-goog-api-key': GEMINI_API_KEY
            },
            body: JSON.stringify(payload)
        }
    );

    // Handle specific error cases
    if (response.status === 429) throw new Error('QUOTA_EXCEEDED');
    if (response.status === 500) throw new Error('MODEL_INTERNAL_ERROR');
    if (response.status === 503) throw new Error('MODEL_OVERLOADED');
    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const result = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    saveArtifact(issueNumber, `gemini-output-${model}.json`, JSON.stringify(data, null, 2));

    try {
        return JSON.parse(result);
    } catch (parseErr) {
        saveArtifact(issueNumber, `gemini-parse-error-${model}-${Date.now()}.json`, JSON.stringify({ message: parseErr.message, stack: parseErr.stack }, null, 2));
        throw new Error('INVALID_RESPONSE');
    }
}

async function buildMetadata(issue) {
    return {
        title: issue.title,
        state: issue.state,
        type: issue.pull_request ? 'pull request' : 'issue',
        number: issue.number,
        author: issue.user?.login || 'unknown',
        user_type: issue.user?.type || 'unknown',
        draft: issue.draft || false,
        locked: issue.locked || false,
        milestone: issue.milestone?.title || null,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        closed_at: issue.closed_at || null,
        comments: issue.comments || 0,
        reactions: issue.reactions?.total_count || 0,
        labels: issue.labels?.map(l => l.name || l) || [],
        assignees: Array.isArray(issue.assignees) ? issue.assignees.map(a => a.login) : (issue.assignee ? [issue.assignee.login] : []),
    };
}

async function buildTimeline(octokit, issueNumber) {
    const timelineEvents = await octokit.paginate(octokit.rest.issues.listEventsForTimeline, {
        owner: OWNER,
        repo: REPO,
        issue_number: issueNumber,
        per_page: 100
    });

    return timelineEvents.slice(-50).map(event => {
        const base = { event: event.event, actor: event.actor?.login, timestamp: event.created_at };
        switch (event.event) {
            case 'commented': return { ...base, body: event.body };
            case 'labeled': return { ...base, label: { name: event.label.name, color: event.label.color } };
            case 'unlabeled': return { ...base, label: { name: event.label.name } };
            case 'renamed': return { ...base, title: { from: event.rename.from, to: event.rename.to } };
            case 'assigned': return { ...base, user: event.assignee?.login };
            case 'unassigned': return { ...base, user: event.assignee?.login };
            case 'closed':
            case 'reopened':
            case 'locked':
            case 'unlocked': return base;
            case 'milestoned':
            case 'demilestoned': return { ...base, milestone: event.milestone?.title };
            case 'referenced': return { ...base, commit_id: event.commit_id, commit_url: event.commit_url };
            case 'mentioned': return base;
            case 'review_requested':
            case 'review_request_removed': return { ...base, requested_reviewer: event.requested_reviewer?.login };
            case 'review_dismissed': return { ...base, review: { state: event.dismissed_review?.state, dismissal_message: event.dismissal_message } };
            case 'merged': return { ...base, commit_id: event.commit_id, commit_url: event.commit_url };
            case 'convert_to_draft':
            case 'ready_for_review': return base;
            case 'transferred': return { ...base, new_repository: event.new_repository?.full_name };
            default: return null;
        }
    }).filter(Boolean);
}

async function buildPrompt(octokit, issue, metadata, lastTriaged, previousReasoning) {
    const basePrompt = fs.readFileSync(path.join(__dirname, 'AutoTriage.prompt'), 'utf8');
    const timelineReport = await buildTimeline(octokit, issue.number);
    const promptString = `${basePrompt}

=== SECTION: BODY OF ISSUE TO ANALYZE ===
${issue.body}

=== SECTION: ISSUE METADATA (JSON) ===
${JSON.stringify(metadata, null, 2)}

=== SECTION: ISSUE TIMELINE (JSON) ===
${JSON.stringify(timelineReport, null, 2)}

=== SECTION: TRIAGE CONTEXT ===
Last triaged: ${lastTriaged || 'never'}
Previous reasoning: ${previousReasoning || 'none'}
Current date: ${new Date().toISOString()}. Do all date logic by explicit comparison to the provided "Current date" timestamp (no vague relative wording).

=== SECTION: OUTPUT FORMAT ===
Return only valid JSON (no Markdown fences, no prose).

Only perform actions (labels, comments, edits, closing) when this prompt explicitly authorizes them and all action-specific preconditions are satisfied. 
Do not take subjective or discretionary actions (for example: "this looks resolved", "seems low-priority", or "apply label because maintainer implied it"). 
Never act based on your own interpretation or summary of maintainer comments — maintainer statements are not instructions unless they explicitly direct the bot. 
If the conditions for any action are ambiguous, incomplete, or not precisely met, do not act.

Required fields (always include):
- reason: string (explanation of analysis and every decision)
- labels: array of strings (complete final label set for the issue)

Optional fields (include only when conditions are met):
- comment: string (comment to post on the issue)
- close: boolean (set to true to close the issue)  
- newTitle: string (new title for the issue)

Inclusion rules for optional fields:
- Only include an optional field if the prompt explicitly authorizes the action
- Do not include fields with null values or empty strings
`;

    saveArtifact(issue.number, `gemini-input.md`, promptString);
    return promptString;
}

function getLabelChanges(existingLabels, suggestedLabels) {
    const current = Array.isArray(existingLabels) ? existingLabels : [];
    const proposed = Array.isArray(suggestedLabels) ? suggestedLabels : [];

    const labelsToAdd = proposed.filter(l => !current.includes(l));
    const labelsToRemove = current.filter(l => !proposed.includes(l));

    const changes = [
        ...labelsToAdd.map(l => `+${l}`),
        ...labelsToRemove.map(l => `-${l}`)
    ];
    const mergedLabels = [...current, ...changes].filter(Boolean);

    return { labelsToAdd, labelsToRemove, mergedLabels };
}

async function updateLabels(octokit, issueNumber, issue, existingLabels, suggestedLabels) {
    const { labelsToAdd, labelsToRemove, mergedLabels } = getLabelChanges(existingLabels, suggestedLabels);
    if (labelsToAdd.length === 0 && labelsToRemove.length === 0) return;

    console.log(`  🏷️ Labels: ${mergedLabels.length ? mergedLabels.join(', ') : 'none'}`);

    if (!octokit || !ENABLED) return;

    if (labelsToAdd.length > 0) {
        await octokit.rest.issues.addLabels({
            owner: OWNER,
            repo: REPO,
            issue_number: issueNumber,
            labels: labelsToAdd
        });
    }

    for (const label of labelsToRemove) {
        await octokit.rest.issues.removeLabel({
            owner: OWNER,
            repo: REPO,
            issue_number: issueNumber,
            name: label
        });
    }
}

async function executeActions(octokit, issueNumber, issue, analysis, metadata) {
    if (analysis.labels) {
        await updateLabels(octokit, issueNumber, issue, metadata.labels, analysis.labels);
    }

    if (analysis.comment) {
        console.log(`  💬 Comments: ${metadata.comments}, Reactions: ${metadata.reactions}`);
        console.log(`  💬 Posting comment:`);
        console.log(analysis.comment.replace(/^/gm, '  > '));
        await createComment(octokit, issueNumber, analysis);
    }

    if (analysis.newTitle) {
        await updateTitle(octokit, issueNumber, issue.title, analysis.newTitle);
    }

    if (analysis.close) {
        await closeIssue(octokit, issueNumber, 'not_planned');
    }
}

async function createComment(octokit, issueNumber, analysis) {
    if (!octokit || !ENABLED) return;

    const commentWithReasoning = `<!-- ${analysis.reason || 'No reasoning provided'} -->\n\n${analysis.comment}`;

    await octokit.rest.issues.createComment({
        owner: OWNER,
        repo: REPO,
        issue_number: issueNumber,
        body: commentWithReasoning
    });
}

async function updateTitle(octokit, issueNumber, title, newTitle) {
    console.log(`  ✏️ Updating title from "${title}" to "${newTitle}"`);
    if (!octokit || !ENABLED) return;
    await octokit.rest.issues.update({
        owner: OWNER,
        repo: REPO,
        issue_number: issueNumber,
        title: newTitle
    });
}

async function closeIssue(octokit, issueNumber, reason = 'not_planned') {
    console.log(`  🔒 Closing issue as ${reason}`);
    if (!octokit || !ENABLED) return;
    await octokit.rest.issues.update({
        owner: OWNER,
        repo: REPO,
        issue_number: issueNumber,
        state: 'closed',
        state_reason: reason
    });
}

async function processIssue(octokit, issue, lastTriaged, previousReasoning, issueNumber) {
    const metadata = await buildMetadata(issue);
    const prompt = await buildPrompt(octokit, issue, metadata, lastTriaged, previousReasoning || '');

    // Quick analysis before going further.
    const initial = await callGemini(prompt, AI_MODEL_FAST, issueNumber);
    initial._model = 'fast';

    // If the model proposes no actions, skip further analysis.
    const { labelsToAdd, labelsToRemove } = getLabelChanges(metadata.labels, initial.labels);
    const hasLabelChanges = labelsToAdd.length > 0 || labelsToRemove.length > 0;
    const hasComment = initial.comment && initial.comment.length > 0;
    const hasTitleChange = initial.newTitle && initial.newTitle !== issue.title;
    const wantsClose = initial.close === true;
    if (!hasLabelChanges && !hasComment && !hasTitleChange && !wantsClose) {
        console.log(`⏭️ #${issueNumber}: ${initial.reason}`);
        return initial;
    }

    // Full analysis before taking any action for highest quality results.
    const analysis = await callGemini(prompt, AI_MODEL_PRO, issueNumber);
    analysis._model = 'pro';
    console.log(`🤖 #${issueNumber}: ${analysis.reason}`);

    await executeActions(octokit, issueNumber, issue, analysis, metadata);
    return analysis;
}

function saveArtifact(issueNumber, name, contents = '') {
    const artifactsDir = path.join(process.cwd(), 'artifacts');
    const filePath = path.join(artifactsDir, `${issueNumber}-${name}`);
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(filePath, contents, 'utf8');
}

async function fetchIssueObjects(octokit, numbers, triageDb) {
    let issues = [];
    if (numbers && numbers.length > 0) {
        // Use provided issue numbers in the exact order they were passed
        for (const number of numbers) {
            const { data } = await octokit.rest.issues.get({
                owner: OWNER,
                repo: REPO,
                issue_number: number
            });
            issues.push(data);
        }

        console.log(`Processing ${issues.length} specified items in provided order`);
        return issues;
    }

    // Use Octokit's paginate to fetch all open issues and PRs
    issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
        owner: OWNER,
        repo: REPO,
        state: 'open',
        sort: 'updated',
        direction: 'desc',
        per_page: 100
    });

    // Sort issues by priority:
    // 1. Has new activity since last triage
    // 2. Has never been triaged
    // 3. Triage data from oldest to newest
    issues.sort((a, b) => {
        const aLastTriaged = triageDb[a.number]?.lastTriaged;
        const bLastTriaged = triageDb[b.number]?.lastTriaged;
        const aHasNewActivity = !aLastTriaged || new Date(a.updated_at) > new Date(aLastTriaged);
        const bHasNewActivity = !bLastTriaged || new Date(b.updated_at) > new Date(bLastTriaged);

        // Priority 1: Issues with new activity since last triage
        if (aHasNewActivity && !bHasNewActivity) return -1;
        if (!aHasNewActivity && bHasNewActivity) return 1;

        // Priority 2: Among same priority group, never triaged comes before previously triaged
        if (!aLastTriaged && !bLastTriaged) return 0;
        if (!aLastTriaged) return -1;
        if (!bLastTriaged) return 1;

        // Priority 3: Among previously triaged, oldest triage data first
        return new Date(aLastTriaged) - new Date(bLastTriaged);
    });

    return issues;
}

async function main() {
    for (const envVar of ['GEMINI_API_KEY', 'GITHUB_REPOSITORY', 'GITHUB_TOKEN']) {
        if (!process.env[envVar]) throw new Error(`Missing environment variable: ${envVar}`);
    }

    console.log('Enabled:', ENABLED ? 'true (actions will be performed)' : 'false (dry-run mode)');

    const triageDb = loadDatabase();
    const octokit = new Octokit({ auth: GITHUB_TOKEN });
    const fetchedIssues = await fetchIssueObjects(octokit, SPECIFIC_ISSUES, triageDb);

    // Process each issue in the order returned by fetchIssueObjects
    for (const issue of fetchedIssues) {
        const issueNumber = issue.number;
        try {
            const lastTriaged = triageDb[issueNumber]?.lastTriaged;
            const previousReasoning = triageDb[issueNumber]?.previousReasoning;
            const analysis = await processIssue(octokit, issue, lastTriaged, previousReasoning, issueNumber);

            // Update in-memory database
            if (DB_PATH && analysis) {
                triageDb[issueNumber] = {
                    lastTriaged: new Date().toISOString(),
                    previousReasoning: analysis.reason
                };
            }
        } catch (error) {
            const msg = (error && error.message) ? error.message : String(error);
            if (msg === 'QUOTA_EXCEEDED') {
                console.error(`❌ #${issueNumber}: Quota exceeded`);
                break;
            }
            if (msg === 'MODEL_INTERNAL_ERROR') {
                console.error(`⚠️ #${issueNumber}: Model internal error`);
                await new Promise(resolve => setTimeout(resolve, 30000));
                continue;
            }
            if (msg === 'MODEL_OVERLOADED') {
                console.warn(`⚠️ #${issueNumber}: Model overloaded`);
                await new Promise(resolve => setTimeout(resolve, 30000));
                continue;
            }
            if (msg === 'INVALID_RESPONSE') {
                console.warn(`⚠️ #${issueNumber}: Invalid response`);
                continue;
            }
            throw error;
        }
    }

    saveDatabase(triageDb);
}

function loadDatabase() {
    if (!DB_PATH) return {};

    if (!fs.existsSync(DB_PATH)) {
        console.log(`Database file not found. Starting with empty database.`);
        return {};
    }

    try {
        const contents = fs.readFileSync(DB_PATH, 'utf8');
        const db = contents ? JSON.parse(contents) : {};
        console.log(`Loaded database with ${Object.keys(db).length} existing entries`);
        return db;
    } catch (error) {
        console.error(`Failed to load database: ${error.message}. Starting with empty database.`);
        return {};
    }
}

function saveDatabase(db) {
    if (!DB_PATH || !ENABLED) return;
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
        console.log(`Database saved successfully`);
    } catch (error) {
        console.error(`Failed to save database: ${error.message}`);
    }
}

main().catch(error => {
    console.error(`💥 ${error.message}`);
    console.error((error && error.stack) ? error.stack : (typeof error === 'string' ? error : JSON.stringify(error, null, 2)));
    core.setFailed(error.message);
    process.exit(1);
});
