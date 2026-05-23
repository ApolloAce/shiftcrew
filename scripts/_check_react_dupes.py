import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)

DIR = "/var/www/shiftcrew"

def run(cmd, t=15):
    i, o, e = ssh.exec_command(cmd, timeout=t)
    return o.read().decode(errors='replace').strip()

# 1. Check for multiple react copies
print("=== Multiple React copies? ===")
print(run(f"find {DIR}/node_modules -name 'react' -type d | grep '/node_modules/react$'"))

# 2. Check react version
print("\n=== React version ===")
print(run(f"cat {DIR}/node_modules/react/package.json | grep '\"version\"'"))

# 3. Check react-dom version
print("\n=== React-DOM version ===")
print(run(f"cat {DIR}/node_modules/react-dom/package.json | grep '\"version\"'"))

# 4. Check if any nested node_modules have their own react
print("\n=== Nested react copies ===")
print(run(f"find {DIR}/node_modules -path '*/node_modules/react/package.json' | head -10"))

# 5. Check what error 310 actually says
print("\n=== React error code 310 ===")
print(run(f"grep -o '310:\"[^\"]*\"' {DIR}/node_modules/react/cjs/react.production.js 2>/dev/null || echo 'not found in production'"))
print(run(f"grep '310' {DIR}/node_modules/react/cjs/react.development.js 2>/dev/null | head -3 || echo 'dev not found'"))

# 6. Check package.json react versions
print("\n=== package.json react deps ===")
print(run(f"grep -E 'react|next' {DIR}/package.json | head -10"))

# 7. Check for react in radix packages
print("\n=== Radix nested react? ===")
print(run(f"ls {DIR}/node_modules/@radix-ui/react-checkbox/node_modules/react/package.json 2>&1"))
print(run(f"ls {DIR}/node_modules/@radix-ui/react-dialog/node_modules/react/package.json 2>&1"))
print(run(f"ls {DIR}/node_modules/@radix-ui/react-label/node_modules/react/package.json 2>&1"))
print(run(f"ls {DIR}/node_modules/@radix-ui/react-dropdown-menu/node_modules/react/package.json 2>&1"))

# 8. npm ls react to find duplicates
print("\n=== npm ls react ===")
print(run(f"cd {DIR} && npm ls react 2>&1 | head -30", t=30))

ssh.close()
