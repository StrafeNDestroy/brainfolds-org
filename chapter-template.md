<!-- 
  BRAINFOLDS CHAPTER TEMPLATE
  ============================
  Instructions:
  1. Delete this comment block
  2. Replace every CAPS placeholder
  3. Write each section following the First Principles sequence:
     problem → stakes → concept named → mechanism → failure mode → what it unlocks
  4. Submit via brainfolds.org/contribute.html
  
  Filename: name this file chNN-brief-slug.md  e.g. ch11-root-anatomy.md
  
  DO NOT include a # heading — the chapter title is entered separately in the form.
  Every ## heading must be unique within this file.
  
  See contributor-guide.md for full documentation on:
  - Images (path conventions, file rules, how to embed)
  - YouTube videos ([youtube: VIDEO_ID] syntax)  
  - LaTeX math ($inline$ and $$display$$)
  - The complete Markdown reference
-->

## Why TOPIC_NAME matters

OPEN WITH THE PROBLEM. Something breaks, surprises, or is unexplained without this
knowledge. Do not start with a definition. Start with a consequence.

What does someone get wrong when they don't understand this? What goes wrong in practice?
What question does this chapter answer that the reader is already asking?

---

## SECTION_ONE_HEADING

Start this section with a specific, observable situation. Then explain the concept
that resolves it.

Each section follows this sequence:
- The problem or gap
- Why it matters
- The concept, named and defined
- How it actually works (the mechanism)
- What breaks when it fails
- What it connects to next

Write in paragraphs, not bullet points. Lists are for steps and enumerations only.

### SUBSECTION (optional)

Use a subsection when a concept within this section needs its own explanation.
Subsections do not appear in the TOC — they are for structure within a section only.

---

## SECTION_TWO_HEADING

Continue with the next concept. Each section should be self-contained — a reader
who starts mid-chapter should be able to follow this section.

If this section has a diagram, add it here:

![Alt text: describe exactly what the image shows, including labels and relationships](images/CURRICULUM/SECTION/COURSE/chNN/fig01-description.png)

If no image is ready yet, use a placeholder note:

[DIAGRAM NEEDED: describe what the diagram should show — labels, relationships, scale]

If this section has a supporting video:

[youtube: dQw4w9WgXcQ]
*Caption: Brief description of what the video covers — X minutes*

---

## SECTION_THREE_HEADING

If this section contains code, commands, or structured data, use fenced code blocks.
Always name the language for syntax highlighting:

```python
# Python example
def example_function(x):
    return x * 2
```

```bash
# Command the reader needs to run
python3 script.py --option value
```

```
Plain block — for ASCII diagrams, structured output,
or anything needing monospace alignment without colour.

Step 1 ──► Step 2 ──► Step 3
              │
              ▼
           Step 2a
```

Remove this code block section entirely if the chapter has no code.

---

## SECTION_FOUR_HEADING

If this chapter covers mathematics, use LaTeX here.

Inline math: The relationship between force, mass and acceleration is $F = ma$.

Display math for equations that deserve visual prominence:

$$
LATEX_EQUATION_HERE
$$

Remove the LaTeX sections entirely if this chapter has no mathematical content.

---

## What this unlocks

End every chapter with this section. Answer one question:
What can the reader now understand, diagnose, or do that they could not before?

Connect forward — what does understanding this make possible in the next chapter
or the next practical task?

One or two paragraphs. Concrete and specific.

---

<!--
  SUBMISSION CHECKLIST
  ====================
  Before submitting, confirm:

  [ ] Chapter opens with a problem, not a definition
  [ ] Every technical term explained in plain English on first use  
  [ ] Every ## section has a unique, descriptive heading
  [ ] Every image has a full alt text description
  [ ] YouTube links use only the VIDEO_ID, not the full URL
  [ ] LaTeX syntax is correct: $inline$ and $$display$$
  [ ] Chapter ends with "What this unlocks" section
  [ ] No # (h1) heading in this file — title entered separately in form
  [ ] File named: chNN-brief-slug.md

  Image ZIP structure (if submitting images):
  your-submission.zip
    chNN-brief-slug.md
    images/
      CURRICULUM/SECTION/COURSE/chNN/
        fig01-description.png
        fig02-description.png
-->
