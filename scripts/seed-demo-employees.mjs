// Seed 16 demo employees via the API
// Run: node scripts/seed-demo-employees.mjs

const HOST = "http://104.248.217.57:3000"

const demoEmployees = [
  { firstName: "Carlos", surname: "Rivera", email: "carlos.rivera@shiftcrew.com", type: "full-time" },
  { firstName: "Maria", surname: "Santos", email: "maria.santos@shiftcrew.com", type: "full-time" },
  { firstName: "James", surname: "Wilson", email: "james.wilson@shiftcrew.com", type: "full-time" },
  { firstName: "Sofia", surname: "Garcia", email: "sofia.garcia@shiftcrew.com", type: "full-time" },
  { firstName: "David", surname: "Lee", email: "david.lee@shiftcrew.com", type: "full-time" },
  { firstName: "Anna", surname: "Kim", email: "anna.kim@shiftcrew.com", type: "full-time" },
  { firstName: "Michael", surname: "Chen", email: "michael.chen@shiftcrew.com", type: "full-time" },
  { firstName: "Jessica", surname: "Torres", email: "jessica.torres@shiftcrew.com", type: "full-time" },
  { firstName: "Daniel", surname: "Martinez", email: "daniel.martinez@shiftcrew.com", type: "part-time" },
  { firstName: "Emily", surname: "Brown", email: "emily.brown@shiftcrew.com", type: "part-time" },
  { firstName: "Robert", surname: "Johnson", email: "robert.johnson@shiftcrew.com", type: "full-time" },
  { firstName: "Lisa", surname: "Nguyen", email: "lisa.nguyen@shiftcrew.com", type: "full-time" },
  { firstName: "Kevin", surname: "Park", email: "kevin.park@shiftcrew.com", type: "full-time" },
  { firstName: "Rachel", surname: "Cruz", email: "rachel.cruz@shiftcrew.com", type: "part-time" },
  { firstName: "Andrew", surname: "Reyes", email: "andrew.reyes@shiftcrew.com", type: "full-time" },
  { firstName: "Nicole", surname: "Flores", email: "nicole.flores@shiftcrew.com", type: "full-time" },
]

async function seed() {
  console.log("Seeding 16 demo employees...\n")
  let created = 0
  let skipped = 0

  for (const emp of demoEmployees) {
    try {
      const res = await fetch(`${HOST}/api/employees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...emp,
          hireDate: "2026-01-01",
        }),
      })

      if (res.ok) {
        const data = await res.json()
        console.log(`  ✅ ${emp.firstName} ${emp.surname} (${data.id})`)
        created++
      } else {
        const err = await res.text()
        console.log(`  ⚠️  ${emp.firstName} ${emp.surname}: ${err}`)
        skipped++
      }
    } catch (err) {
      console.error(`  ❌ ${emp.firstName} ${emp.surname}: ${err.message}`)
      skipped++
    }
  }

  console.log(`\nDone! Created: ${created}, Skipped: ${skipped}`)
}

seed()
