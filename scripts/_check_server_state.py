import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)

# Check if our String() fix is in the deployed file
i,o,e = ssh.exec_command('grep -n "String(leave" /var/www/shiftcrew/app/dashboard/reports/page.tsx | head -10', timeout=10)
print('String fixes:', o.read().decode().strip())

# Check if build is running right now
i,o,e = ssh.exec_command("pgrep -f 'next build' || echo NOT_RUNNING", timeout=10)
print('build status:', o.read().decode().strip())

# Check if the file has the print dialog
i,o,e = ssh.exec_command('grep -n "printDialogOpen" /var/www/shiftcrew/app/dashboard/reports/page.tsx | head -5', timeout=10)
print('printDialog:', o.read().decode().strip())

# Get the file size  
i,o,e = ssh.exec_command('wc -l /var/www/shiftcrew/app/dashboard/reports/page.tsx', timeout=10)
print('lines:', o.read().decode().strip())

# Check if PM2 is running and when it was last restarted
i,o,e = ssh.exec_command('pm2 list 2>&1 | head -10', timeout=10)
print('pm2:', o.read().decode(errors='replace').strip())

# Check the .next directory timestamp
i,o,e = ssh.exec_command('ls -la /var/www/shiftcrew/.next/BUILD_ID 2>&1', timeout=10)
print('build:', o.read().decode().strip())

# Check if there were build errors
i,o,e = ssh.exec_command("grep -i 'error\\|failed' /tmp/nextbuild.log | head -5", timeout=10)
print('errors:', o.read().decode(errors='replace').strip())

ssh.close()
