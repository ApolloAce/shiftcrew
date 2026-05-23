import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)

# Kill existing build processes
i,o,e = ssh.exec_command("kill $(pgrep -f 'next build') 2>/dev/null; echo KILLED", timeout=10)
print('kill:', o.read().decode().strip())

# Check date-fns version
i,o,e = ssh.exec_command('cat /var/www/shiftcrew/node_modules/date-fns/package.json | grep version | head -1', timeout=10)
print('date-fns:', o.read().decode().strip())

# Look for any non-string rendering on the server version - check the EXACT leave table section
i,o,e = ssh.exec_command('sed -n "1450,1480p" /var/www/shiftcrew/app/dashboard/reports/page.tsx', timeout=10)
print('leave table:')
print(o.read().decode().strip())

# check the label component
i,o,e = ssh.exec_command('cat /var/www/shiftcrew/components/ui/label.tsx', timeout=10)
print('\nlabel.tsx:')
print(o.read().decode().strip())

ssh.close()
