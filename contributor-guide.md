# Brainfolds Contributor Guide

Everything you need to write a chapter, format it correctly, and submit it.

---

## Quick start

1. Download `chapter-template.md` from this page
2. Write your chapter in that template
3. Open the Chapter Generator at `brainfolds.org/contribute.html` and submit

That is the whole process. The rest of this guide is reference.

---

## The writing method

Every Brainfolds chapter follows the same structure. Before you write a word of content, read the **writing guide** — it is short and it explains why this structure produces chapters that actually teach rather than chapters that just cover material.

The sequence for every section:

1. **The problem** — something is broken, surprising, or unexplained
2. **The stakes** — why does this matter to the reader right now?
3. **The concept, named** — earn the definition
4. **The mechanism** — how does it actually work?
5. **The failure mode** — what goes wrong when this fails?
6. **What it unlocks** — what can the reader now do that they could not before?

---

## The markdown template

Download `chapter-template.md`. It has every section pre-built with placeholder text. Replace the placeholders. Do not change the heading structure.

---

## Markdown reference

### Headings

```markdown
## Section heading         ← appears in the TOC sidebar
### Subsection heading     ← does NOT appear in TOC
#### Minor heading         ← use sparingly
```

Use only `##` and `###` in your content. The `#` (h1) is the chapter title — the generator fills that in from your submission form. Do not put a `#` heading in your Markdown file.

Every `##` heading **must** have a unique id — the generator adds these automatically from the heading text. If you need to reference a specific section, use the kebab-case version of the heading as the anchor: `[see this section](#why-this-matters)`.

---

### Text formatting

```markdown
**Bold text** — use for key terms on first introduction
*Italic text* — use for emphasis or titles
`inline code` — use for technical terms, file names, commands
~~strikethrough~~ — avoid
```

---

### Paragraphs and line breaks

Leave a blank line between paragraphs. A single line break within a paragraph does not create a new paragraph — it continues the same one.

```markdown
This is the first paragraph.

This is the second paragraph.

This is one paragraph
that continues on the next line — still one paragraph.
```

---

### Lists

Use lists sparingly. Prose is usually clearer. A bulleted list is appropriate when items are genuinely parallel and unordered. A numbered list is appropriate when order matters.

```markdown
- First item
- Second item
- Third item

1. Step one
2. Step two
3. Step three
```

Do not use lists to replace sentences. "Plants need water, sunlight, and soil" is clearer than three bullet points.

---

### Blockquotes

```markdown
> This is a blockquote. Use for important callouts, key definitions,
> or the "why this matters" opening of a section.
```

---

### Code blocks

Code blocks are safe to use — all content inside them is escaped by the generator before publishing. A `<script>` tag inside a code block renders as literal text, never as code that runs.

**Fenced code blocks** — three backticks, with the language name for syntax highlighting:

````markdown
```python
def photosynthesis(light, water, co2):
    glucose = light + water + co2
    return glucose, oxygen
```

```javascript
const depth = '../../../';
const url = `https://brainfolds.org/${path}`;
```

```bash
python3 build/scripts/build-offline.py
```

```sql
SELECT chapter_title, author_name
FROM content_submissions
WHERE status = 'approved'
ORDER BY created_at DESC;
```

```
Plain preformatted block — no syntax highlighting.
Use for: ASCII diagrams, structured reference tables,
         command output, anything that needs monospace
         alignment but isn't a specific language.
```
````

**Supported language names** for syntax highlighting:

`python` `javascript` `typescript` `html` `css` `bash` `shell` `sql` `json` `yaml` `markdown` `latex` `r` `java` `c` `cpp` `rust` `go`

If your language is not in the list, use a plain block (no language name) — it will still render correctly in a monospace font, just without colour.

**Inline code** — single backticks for terms, file names, commands, and short snippets within a sentence:

```markdown
Install with `pip install numpy`.
The file lives at `site/assets/css/style.css`.
Set the variable to `true` or `false`.
Use the `print()` function to debug.
```

**When to use code blocks:**

- Any block of code longer than one line
- Commands the reader needs to type exactly
- File contents the reader needs to copy
- Structured data (JSON, YAML, SQL queries)
- ASCII diagrams or text-art figures
- Mathematical notation that LaTeX would overcomplicate (simple formulas like `f(x) = x^2 + 1`)

**When NOT to use code blocks:**

- Quoting a concept name — write it in **bold** on first use, then plain text after
- File paths mentioned in passing — use inline code: `site/images/`
- Emphasis — that is what bold and italic are for

---

### A note on raw HTML

Raw HTML tags in your Markdown (`<div>`, `<span>`, `<b onclick="...">` etc.) are stripped before publishing. This is intentional — it keeps submitted content safe and consistent. If you feel you need raw HTML to achieve something, describe what you need in the feedback section of the contribute form and we will add support for it properly.

Code blocks are the one exception: their contents are always preserved and escaped, so you can demonstrate HTML code safely:

````markdown
```html
<figure>
  <img src="path/to/image.png" alt="Description"/>
  <figcaption>Caption text</figcaption>
</figure>
```
````

---

### Horizontal rule

```markdown
---
```

Use between major topic shifts. Do not overuse.

---

## Images

### Where images go

All chapter images live in `site/images/`, organised by curriculum path:

```
site/
  images/
    self-sufficiency/
      s01-foundation/
        c01-botany-basics/
          ch01/
            fig01-plant-cell.png
            fig02-cell-wall.png
    scholarium/
      t01-foundations/
        c01-english-reading-writing/
          ch01/
            fig01-alphabet-chart.png
```

The path mirrors the chapter path. Every chapter gets its own folder.

### Image file rules

- **Format:** PNG for diagrams and illustrations. JPG for photographs.
- **Size:** Compress before uploading. Max 500 KB per image (the form enforces this). Use [squoosh.app](https://squoosh.app) — free, no account. Aim for under 200 KB for fast loading.
- **Width:** 800px–1200px wide. The content column is 860px max.
- **Filename:** lowercase, hyphens only. Descriptive. `fig01-plant-cell.png` not `image1.PNG`.

### How to include an image in Markdown

Standard Markdown image syntax:

```markdown
![Alt text describing the image](images/path/to/fig01.png)
```

The generator converts this to a `<figure>` element automatically. The alt text becomes the `alt` attribute — **write a real description**, not just the filename. Screen readers read the alt text aloud to blind users.

```markdown
![Diagram showing the five layers of soil from bedrock at the bottom to 
topsoil at the surface, with roots penetrating the upper three layers](images/scholarium/t01-foundations/c01-english-reading-writing/ch01/fig01-soil-layers.png)
```

### If you are submitting via the contribute form

Attach images separately. The form accepts a ZIP file containing your `.md` file and all images at the correct relative paths. The reviewer will place them in the correct location before publishing.

If you cannot provide images, describe what the diagram should show in square brackets in your Markdown — the production team will commission it:

```markdown
[DIAGRAM NEEDED: Cross-section of a plant root showing the epidermis, 
cortex, endodermis, and vascular cylinder from outside to centre]
```

---

## YouTube videos

YouTube videos are embedded using a special shortcode — **not** raw HTML. This keeps your Markdown readable and lets the generator handle the privacy-safe embed (youtube-nocookie.com) and the correct responsive container automatically.

### Syntax

```markdown
[youtube: VIDEO_ID]
```

The VIDEO_ID is the part after `watch?v=` in the YouTube URL.

**Example:**

```
YouTube URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ
Video ID:    dQw4w9WgXcQ
```

```markdown
[youtube: dQw4w9WgXcQ]
```

### Rules for video inclusion

- **YouTube only.** No Vimeo, no direct video files, no other platforms.
- **Educational content only.** The video must directly support the chapter content.
- **No autoplay.** Videos never autoplay. The reader clicks to play.
- **One or two per chapter maximum.** Video is supplementary, not the primary content.
- **Place after the relevant section.** A video about photosynthesis goes after the photosynthesis section, not at the top of the chapter.

### Caption (optional)

```markdown
[youtube: dQw4w9WgXcQ]
*Caption: How photosynthesis works — 8 minutes*
```

A line of italic text immediately after the shortcode becomes the video caption.

---

## LaTeX mathematics

LaTeX is supported for mathematical content. Use it for Scholarium mathematics, physics, chemistry, and any chapter that requires precise mathematical notation.

The contribute page preview renders LaTeX live as you type — you can verify every formula before submitting. If a formula looks wrong in the preview, it will look wrong on the published page.

For a practical introduction to LaTeX syntax, watch this tutorial: [youtube: Aq5WXmQQooo] — covers everything you need for writing mathematical chapters on Brainfolds.

### Inline math

Wrap with single dollar signs. Use for expressions within a sentence.

```markdown
The formula is $E = mc^2$.

The quadratic formula is $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$.

Water is $\text{H}_2\text{O}$ and has a molar mass of $18.015\ \text{g/mol}$.
```

Renders as: The formula is $E = mc^2$. The quadratic formula is $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$.

### Display math

Wrap with double dollar signs on their own lines. Use for standalone equations that deserve visual prominence.

**Important:** the `$$` block must be separated from any surrounding text by a blank line on both sides. Without a blank line before `$$`, the parser treats the equation as part of the preceding paragraph and will not render it.

```markdown
The previous paragraph ends here.

$$
\int_0^\infty e^{-x^2}\, dx = \frac{\sqrt{\pi}}{2}
$$

The next paragraph starts here.
```

```markdown
$$
F = ma
$$
```

```markdown
$$
E = mc^2
$$
```

### Common LaTeX reference

| What you want | LaTeX syntax | Result description |
|---|---|---|
| Fraction | `\frac{a}{b}` | a over b |
| Square root | `\sqrt{x}` | root of x |
| Power | `x^{2}` | x squared |
| Subscript | `x_{n}` | x sub n |
| Sum | `\sum_{i=1}^{n}` | summation |
| Integral | `\int_a^b` | definite integral |
| Greek letters | `\alpha \beta \gamma \pi` | α β γ π |
| Infinity | `\infty` | ∞ |
| Not equal | `\neq` | ≠ |
| Approximately | `\approx` | ≈ |
| Multiplication | `\times` | × |
| Division | `\div` | ÷ |
| Plus/minus | `\pm` | ± |
| Bold vector | `\mathbf{v}` | **v** |
| Matrix | `\begin{pmatrix} a & b \\ c & d \end{pmatrix}` | 2×2 matrix |

### Where LaTeX is appropriate

- Mathematics chapters — always
- Physics — forces, equations of motion, field equations
- Chemistry — molecular formulae, reaction equations, stoichiometry
- Any chapter where imprecise notation would mislead the reader

LaTeX is **not** appropriate for:
- Botany, history, language arts, geography — spell things out in plain English
- Simple numbers — write "the area is 24 square metres" not `$A = 24\ \text{m}^2$`
- Showing off — if plain text communicates it clearly, use plain text

---

## The complete Markdown structure

Here is a complete example chapter Markdown file showing every element in use:

````markdown
## Why roots matter

Every plant you will ever grow has an invisible half underground.
The visible part — stems, leaves, flowers — gets all the attention.
But the roots determine whether the plant lives or dies.

A plant with poor root development will wilt on a hot afternoon
even if the soil is damp. Understanding roots means understanding
why this happens — and what to do about it.

## What roots actually do

Roots have four jobs. Anchoring is the most obvious — a mature oak
needs hundreds of square metres of root spread to stay upright in
a storm. The other three are less visible but more critical: water
absorption, mineral uptake, and storage.

### Water absorption

![Cross-section of a root tip showing the root cap, meristematic zone, 
elongation zone, and maturation zone with root hairs](images/self-sufficiency/s01-foundation/c01-botany-basics/ch03/fig01-root-zones.png)

Water enters through root hairs — tiny extensions of single cells
that massively increase surface area. A single rye plant has been
estimated to have 14 billion root hairs with a combined length of
10,000 kilometres.

[youtube: 7JnCHqkBBXw]
*Caption: Root hair development under a microscope — 4 minutes*

## The chemistry of uptake

Mineral ions move against a concentration gradient — from low
concentration in the soil to high concentration inside the root.
This requires energy. The equation for active transport is:

$$
\Delta G = RT \ln\left(\frac{[C]_{in}}{[C]_{out}}\right) + zF\Delta\psi
$$

Where $R$ is the gas constant, $T$ is temperature in Kelvin,
$[C]$ is ion concentration, $z$ is ion charge, $F$ is Faraday's
constant, and $\Delta\psi$ is the electrical potential difference.

In practice: roots spend ATP to pull minerals in against the gradient.
A plant that cannot make enough ATP — from poor light or waterlogging —
cannot absorb minerals even if they are abundant in the soil.

## What this unlocks

You can now diagnose a nutrient deficiency that looks like a watering
problem, and a watering problem that looks like a nutrient deficiency.
The next chapter covers what each mineral does and what its absence
looks like — which only makes sense if you understand how minerals
get into the plant in the first place.
````

---

## Submission checklist

Before submitting:

- [ ] Every `##` section has a clear topic
- [ ] The chapter opens with a problem, not a definition
- [ ] Every technical term is explained in plain English on first use
- [ ] Every image has a descriptive alt text
- [ ] Every YouTube link uses only the video ID, not the full URL
- [ ] LaTeX math is tested — `$` for inline, `$$` for display
- [ ] The chapter ends with a "What this unlocks" section
- [ ] No `#` (h1) heading — the title is entered separately in the form
- [ ] Markdown file is named `chNN-slug.md` e.g. `ch11-root-anatomy.md`
- [ ] Images are in a ZIP alongside the Markdown at the correct relative paths

---

*Questions? Open the contribute page and use the feedback section.*
