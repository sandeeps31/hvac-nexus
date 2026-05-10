#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# HVAC Nexus — Filename Migration Script
# Removes 'hvac-' prefix from all module pages.
# Run this from your repo root.
# ═══════════════════════════════════════════════════════════════
#
# WHAT IT DOES:
#   1. Renames 36 files with `git mv` (preserves history)
#   2. Updates 217+ cross-references in all .html and .js files
#   3. Leaves hvac-nexus-tracker.html alone (legacy, will be removed post-launch)
#
# BEFORE RUNNING:
#   - Commit any pending changes (clean working tree)
#   - Make sure you're on a feature branch, e.g.:
#       git checkout -b rename-pages
#   - Drop the new sidebar.js and 404.html into the repo root first
#
# AFTER RUNNING:
#   - Test locally: open index.html, sign in, click every sidebar item
#   - Visit /hvac-commissioning.html to verify 404 redirects to /commissioning.html
#   - Commit: git add -A && git commit -m "Rename hvac-*.html pages to drop prefix"
#   - Push: git push
# ═══════════════════════════════════════════════════════════════

set -e  # Exit on any error

echo "Step 1/3: Renaming files with git mv..."

# Rename map (36 files). hvac-nexus-tracker.html intentionally excluded.
git mv hvac-asset-register.html            asset-register.html
git mv hvac-boards.html                    boards.html
git mv hvac-budget.html                    budget.html
git mv hvac-commissioning.html             commissioning.html
git mv hvac-commissioning-plan.html        commissioning-plan.html
git mv hvac-company-itp-templates.html     company-itp-templates.html
git mv hvac-defect-form.html               defect-form.html
git mv hvac-defects.html                   defects.html
git mv hvac-drawings.html                  drawings.html
git mv hvac-drawing-viewer.html            drawing-viewer.html
git mv hvac-equipment-schedule.html        equipment-schedule.html
git mv hvac-equip-templates.html           equip-templates.html
git mv hvac-fire-register.html             fire-register.html
git mv hvac-itp.html                       itp.html
git mv hvac-itp-form.html                  itp-form.html
git mv hvac-itp-register.html              itp-register.html
git mv hvac-itp-templates.html             itp-templates.html
git mv hvac-login.html                     login.html
git mv hvac-maintenance-library.html       maintenance-library.html
git mv hvac-material-receiving.html        material-receiving.html
git mv hvac-om-manual.html                 om-manual.html
git mv hvac-pdf-markup.html                pdf-markup.html
git mv hvac-pdf-viewer.html                pdf-viewer.html
git mv hvac-precommissioning.html          precommissioning.html
git mv hvac-precx-templates.html           precx-templates.html
git mv hvac-procurement-pos.html           procurement-pos.html
git mv hvac-procurement-schedule.html      procurement-schedule.html
git mv hvac-progress-claims.html           progress-claims.html
git mv hvac-project-precx-template.html    project-precx-template.html
git mv hvac-specifications.html            specifications.html
git mv hvac-subcontractor-agreements.html  subcontractor-agreements.html
git mv hvac-subcontractor-variations.html  subcontractor-variations.html
git mv hvac-superadmin.html                superadmin.html
git mv hvac-tech-submissions.html          tech-submissions.html
git mv hvac-variations.html                variations.html
git mv hvac-vendor-invoices.html           vendor-invoices.html

echo "  ✓ Renamed 36 files"

echo "Step 2/3: Updating cross-references in .html and .js files..."

# IMPORTANT: order matters. We replace the LONGEST/most-specific names first
# so we don't accidentally break compound names. For example, replacing
# 'hvac-itp.html' before 'hvac-itp-form.html' would corrupt 'hvac-itp-form.html'
# into 'itp-form.html' — actually that's fine because the prefix is the same
# length. But to be safe we sort by length descending.

# Detect platform for sed -i flag (macOS needs '', Linux doesn't)
if [[ "$OSTYPE" == "darwin"* ]]; then
  SED_INPLACE=(-i '')
else
  SED_INPLACE=(-i)
fi

# Files to update — all html and js, recursive, excluding .git and node_modules
FILES=$(find . -type f \( -name "*.html" -o -name "*.js" \) \
  -not -path "./.git/*" \
  -not -path "./node_modules/*" \
  -not -name "404.html" \
  -not -name "hvac-nexus-tracker.html")

# Note: we do NOT process 404.html (it intentionally references hvac-* in its regex)
#       and we leave hvac-nexus-tracker.html alone

# The replacement list, longest first to avoid partial-match issues
REPLACEMENTS=(
  "hvac-subcontractor-agreements.html|subcontractor-agreements.html"
  "hvac-subcontractor-variations.html|subcontractor-variations.html"
  "hvac-project-precx-template.html|project-precx-template.html"
  "hvac-company-itp-templates.html|company-itp-templates.html"
  "hvac-procurement-schedule.html|procurement-schedule.html"
  "hvac-maintenance-library.html|maintenance-library.html"
  "hvac-material-receiving.html|material-receiving.html"
  "hvac-equipment-schedule.html|equipment-schedule.html"
  "hvac-commissioning-plan.html|commissioning-plan.html"
  "hvac-procurement-pos.html|procurement-pos.html"
  "hvac-precommissioning.html|precommissioning.html"
  "hvac-precx-templates.html|precx-templates.html"
  "hvac-progress-claims.html|progress-claims.html"
  "hvac-tech-submissions.html|tech-submissions.html"
  "hvac-vendor-invoices.html|vendor-invoices.html"
  "hvac-equip-templates.html|equip-templates.html"
  "hvac-itp-templates.html|itp-templates.html"
  "hvac-asset-register.html|asset-register.html"
  "hvac-drawing-viewer.html|drawing-viewer.html"
  "hvac-itp-register.html|itp-register.html"
  "hvac-fire-register.html|fire-register.html"
  "hvac-specifications.html|specifications.html"
  "hvac-defect-form.html|defect-form.html"
  "hvac-pdf-markup.html|pdf-markup.html"
  "hvac-pdf-viewer.html|pdf-viewer.html"
  "hvac-superadmin.html|superadmin.html"
  "hvac-commissioning.html|commissioning.html"
  "hvac-variations.html|variations.html"
  "hvac-itp-form.html|itp-form.html"
  "hvac-om-manual.html|om-manual.html"
  "hvac-drawings.html|drawings.html"
  "hvac-defects.html|defects.html"
  "hvac-budget.html|budget.html"
  "hvac-boards.html|boards.html"
  "hvac-login.html|login.html"
  "hvac-itp.html|itp.html"
)

for replacement in "${REPLACEMENTS[@]}"; do
  old="${replacement%|*}"
  new="${replacement#*|}"
  echo "  ↻ $old → $new"
  echo "$FILES" | xargs sed "${SED_INPLACE[@]}" "s|$old|$new|g"
done

echo "  ✓ All cross-references updated"

echo "Step 3/3: Verifying no stale references remain..."

# Look for any remaining hvac-*.html references (other than hvac-nexus-tracker)
STALE=$(grep -rE "hvac-(asset-register|boards|budget|commissioning|commissioning-plan|company-itp-templates|defect-form|defects|drawings|drawing-viewer|equipment-schedule|equip-templates|fire-register|itp|itp-form|itp-register|itp-templates|login|maintenance-library|material-receiving|om-manual|pdf-markup|pdf-viewer|precommissioning|precx-templates|procurement-pos|procurement-schedule|progress-claims|project-precx-template|specifications|subcontractor-agreements|subcontractor-variations|superadmin|tech-submissions|variations|vendor-invoices)\.html" \
  --include="*.html" --include="*.js" \
  --exclude-dir=".git" --exclude-dir=node_modules \
  --exclude="404.html" --exclude="hvac-nexus-tracker.html" \
  . 2>/dev/null | head -5)

if [ -z "$STALE" ]; then
  echo "  ✓ No stale references found"
else
  echo "  ⚠ WARNING: Some references still exist:"
  echo "$STALE"
  echo "  Review and fix manually before committing."
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Migration complete. Next steps:"
echo "  1. Replace your sidebar.js with the new one (already done if you copied it before running)"
echo "  2. Drop 404.html in repo root (if not already there)"
echo "  3. Test locally — open index.html, sign in, click every sidebar item"
echo "  4. git status   (review changes)"
echo "  5. git commit -m 'Rename hvac-*.html pages to drop prefix'"
echo "  6. git push"
echo "═══════════════════════════════════════════════════════════════"
