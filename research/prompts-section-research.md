# Prompts Section Research

Date: 2026-03-20

## Goal

Design a prompt library inside the launcher so prompts are not scattered across notes, chat histories, and random files.

The user requirements already include:

- add / remove prompts
- copy prompts later
- title and description
- optional example output

This research expands that into a practical first version.

## Source Notes

### Prompt management systems

1. PromptLayer: "How PromptLayer Works"
   Source: <https://docs.promptlayer.com/why-promptlayer/how-it-works>
   Relevant points:
   - prompt management products center on versioning prompts, executing them, and logging requests with metadata
   - prompt registries work better when prompts can be searched and explored later
   - metadata like tags and scores helps with organization

2. Promptfoo: "Prompt Configuration"
   Source: <https://www.promptfoo.dev/docs/configuration/prompts/>
   Relevant points:
   - prompt templates benefit from variables
   - prompts may be plain text or chat/message format
   - labels help organize prompts
   - seeing the final rendered prompt after variable substitution is important
   - few-shot examples are a common pattern worth supporting

3. Promptfoo: "Assertions & metrics"
   Source: <https://www.promptfoo.dev/docs/configuration/expected-outputs/>
   Relevant points:
   - output checks are useful because they automate prompt evaluation
   - JSON validity / schema checks are especially practical for structured prompts

## Best Features To Add

### Must-have

1. Prompt cards with real metadata
   - title
   - description
   - tags
   - last updated time

2. Prompt body with variables
   - use `{{variable}}` style placeholders
   - store example variable values
   - render a live preview of the final prompt

3. Copy workflows
   - copy raw template
   - copy rendered prompt
   - duplicate prompt

4. Search and filtering
   - search title, description, tags, and prompt body
   - filter by tags

5. Example output and notes
   - helps future reuse
   - makes prompt intent obvious without running a model

### Strong additions that fit this app

6. Prompt format support
   - text prompt
   - chat prompt (system/user/assistant messages)

7. Few-shot examples
   - separate structured field instead of forcing users to embed examples manually

8. Test values / example variables
   - lets users preview the final prompt quickly

9. Favorite or pinned prompts
   - prompt libraries become noisy fast

10. Lightweight evaluation checklist
   - store expected traits or acceptance notes
   - not a full eval framework, but enough to remember what "good" looks like

## UX Recommendations

1. Use a library + detail layout
   - list or grid for discovery
   - detail/editor panel for the selected prompt

2. Keep prompt preview always available
   - users should not have to mentally resolve variables

3. Separate "template" from "example output"
   - these are different concepts and should not share one textarea

4. Make duplication a first-class action
   - prompt iteration usually starts from cloning

5. Keep the system intentionally simple
   - this app is not replacing full prompt management products
   - it should mainly organize, preview, and reuse prompts fast

## Scope Chosen For Implementation

The first implementation should include:

- prompt CRUD
- title, description, tags, prompt format, and prompt content
- example variables
- live rendered preview
- example output
- notes
- duplicate and copy actions
- search and tag filtering

The first implementation can postpone full prompt version history and automated LLM evaluation. A clean model with metadata, example variables, and rendered preview already solves the main reuse problem.
