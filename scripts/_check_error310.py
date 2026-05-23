import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)

DIR = "/var/www/shiftcrew"

def run(cmd, t=15):
    i, o, e = ssh.exec_command(cmd, timeout=t)
    out = o.read().decode(errors='replace').strip()
    err = e.read().decode(errors='replace').strip()
    return out + ('\nSTDERR: ' + err if err else '')

# 1. Find error 310 in React's production bundle
print("=== Search for error 310 in React bundles ===")
print(run(f"grep -r '310' {DIR}/node_modules/react/cjs/ 2>/dev/null | grep -i 'error\\|throw' | head -5"))

# 2. Check the actual minified error message
print("\n=== React minified error URL decode ===")
print(run(f"curl -s 'https://react.dev/errors/310' 2>&1 | grep -i 'error\\|message\\|title' | head -5"))

# 3. Check if there's a codes.json or similar  
print("\n=== React error codes file ===")
print(run(f"find {DIR}/node_modules/react -name '*.json' | grep -i err | head -5"))

# 4. Try to find the error code in the production min JS
print("\n=== Error in react production file ===")
# The minified error format in React 19 is typically something like:
# "Minified React error #310; visit..."
# Let's look in the actual bundle
print(run(f"grep -o 'error #310[^;]*' {DIR}/.next/static/chunks/*.js 2>/dev/null | head -3"))
print(run(f"grep -o 'react.dev/errors/310' {DIR}/.next/static/chunks/*.js 2>/dev/null | head -3"))

# 5. Check the undminified error in development React
print("\n=== React dev errors ===")
print(run(f"ls {DIR}/node_modules/react/cjs/"))

# 6. Try running next dev momentarily to get the unminified error
# Actually let's just check the development bundle
print("\n=== Grepping for 310 in dev bundle ===")
print(run(f"grep -c '310' {DIR}/node_modules/react/cjs/react.development.js 2>/dev/null"))

# 7. Search for 'Invalid hook' or 'Objects are not valid' in React dev
print("\n=== Error messages in dev react ===")
print(run(f"grep -n 'Invalid hook call' {DIR}/node_modules/react/cjs/react.development.js 2>/dev/null | head -3"))
print(run(f"grep -n 'Objects are not valid' {DIR}/node_modules/react-dom/cjs/react-dom.development.js 2>/dev/null | head -3"))

# 8. Let's check what's at offset 226075 in the actual bundle
print("\n=== Bundle check ===")
print(run(f"ls -la {DIR}/.next/static/chunks/app/dashboard/reports/ 2>/dev/null"))

ssh.close()
