import os
import re

# Directory containing HTML files
# Run this from your hvac-nexus repo root folder
html_dir = '.'

# The script tag to inject
DB_SCRIPT = '<script src="db.js"></script>'

# Files to update
html_files = [f for f in os.listdir(html_dir) if f.endswith('.html')]

updated = []
skipped = []

for filename in html_files:
    filepath = os.path.join(html_dir, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Skip if already has db.js
    if 'db.js' in content:
        skipped.append(filename)
        continue
    
    # Inject before closing </head> tag
    if '</head>' in content:
        new_content = content.replace('</head>', f'{DB_SCRIPT}\n</head>', 1)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        updated.append(filename)
    else:
        skipped.append(filename + ' (no </head> tag)')

print(f'Updated {len(updated)} files:')
for f in updated:
    print(f'  ✅ {f}')

print(f'\nSkipped {len(skipped)} files:')
for f in skipped:
    print(f'  — {f}')
