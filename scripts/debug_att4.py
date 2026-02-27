import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e')

# Check for Map-related patterns in the scheduling page
for pattern in ['new Map', 'Map<string', '.get(', 'weekAttendance', 'Object.keys(dayAtt', 'Record<string, Record']:
    stdin, stdout, stderr = ssh.exec_command(f'grep -n "{pattern}" /var/www/shiftcrew/app/dashboard/scheduling/page.tsx')
    out = stdout.read().decode().strip()
    print(f'=== Pattern: {pattern} ===')
    print(out if out else '(no matches)')
    print()

ssh.close()
