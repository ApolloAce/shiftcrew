import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e')

# Find which chunk contains the Reports page component
stdin, stdout, stderr = ssh.exec_command('grep -l "ReportsPage" /var/www/shiftcrew/.next/static/chunks/*.js 2>/dev/null')
print('=== Chunks with ReportsPage ===')
out = stdout.read().decode().strip()
print(out if out else '(none)')

# Check for getActiveEmployees in chunks
stdin, stdout, stderr = ssh.exec_command('grep -l "getActiveEmployees" /var/www/shiftcrew/.next/static/chunks/*.js 2>/dev/null')
print('\n=== Chunks with getActiveEmployees ===')
out = stdout.read().decode().strip()
print(out if out else '(none)')

# Check for Chart in chunks  
stdin, stdout, stderr = ssh.exec_command('grep -l "ChartJS\\|chart\\.js" /var/www/shiftcrew/.next/static/chunks/*.js 2>/dev/null')
print('\n=== Chunks with ChartJS ===')
out = stdout.read().decode().strip()
print(out if out else '(none)')

# Let's look at the page RSC payload for hints
stdin, stdout, stderr = ssh.exec_command('curl -s -H "RSC: 1" http://localhost:3000/dashboard/reports 2>&1 | head -200')
print('\n=== RSC payload ===')
out = stdout.read().decode()
print(out[:3000] if out else '(empty)')

# Also check if there are any webpack/turbopack errors in the build
stdin, stdout, stderr = ssh.exec_command('ls /var/www/shiftcrew/.next/static/chunks/app/dashboard/reports/ 2>/dev/null')
print('\n=== App chunks for reports ===')
out = stdout.read().decode().strip()
print(out if out else '(no dedicated chunks dir)')

# Check all app chunk directories
stdin, stdout, stderr = ssh.exec_command('find /var/www/shiftcrew/.next/static/chunks/app -type f -name "*.js" 2>/dev/null | head -30')
print('\n=== All app chunk files ===')
out = stdout.read().decode().strip()
print(out if out else '(none)')

ssh.close()
