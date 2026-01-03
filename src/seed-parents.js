/**
 * Seed script to add demo parents to students
 * Run: node src/seed-parents.js
 */

import pg from 'pg';
const { Client } = pg;

// Demo data for parents
const FIRST_NAMES_MALE = [
  'Rajesh', 'Suresh', 'Mahesh', 'Ramesh', 'Dinesh', 'Mukesh', 'Naresh', 'Ganesh',
  'Anil', 'Sunil', 'Vijay', 'Sanjay', 'Ajay', 'Ravi', 'Amit', 'Sumit',
  'Rakesh', 'Prakash', 'Vikas', 'Deepak', 'Ashok', 'Vinod', 'Manoj', 'Pankaj',
  'Sandeep', 'Rajendra', 'Narendra', 'Devendra', 'Jitendra', 'Surendra'
];

const FIRST_NAMES_FEMALE = [
  'Sunita', 'Anita', 'Kavita', 'Savita', 'Mamta', 'Sarla', 'Kamla', 'Shanti',
  'Rekha', 'Meena', 'Seema', 'Neha', 'Asha', 'Usha', 'Lata', 'Geeta',
  'Suman', 'Pushpa', 'Kusum', 'Nirmala', 'Urmila', 'Shobha', 'Prabha', 'Maya',
  'Radha', 'Sita', 'Durga', 'Lakshmi', 'Saraswati', 'Parvati'
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Singh', 'Kumar', 'Gupta', 'Jain', 'Agarwal', 'Patel',
  'Mishra', 'Pandey', 'Tiwari', 'Dubey', 'Yadav', 'Chauhan', 'Rajput', 'Thakur',
  'Reddy', 'Rao', 'Nair', 'Menon', 'Iyer', 'Shah', 'Mehta', 'Desai',
  'Patil', 'Kulkarni', 'Deshpande', 'Joshi', 'Saxena', 'Srivastava'
];

const OCCUPATIONS = [
  'Business Owner', 'Government Employee', 'Private Sector Employee', 'Teacher',
  'Doctor', 'Engineer', 'Lawyer', 'Accountant', 'Farmer', 'Shopkeeper',
  'Bank Employee', 'Police Officer', 'Army Personnel', 'Self Employed',
  'IT Professional', 'Manager', 'Contractor', 'Sales Executive', 'Driver',
  'Factory Worker', 'Electrician', 'Plumber', 'Mechanic', 'Carpenter'
];

const CITIES = [
  'Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Pune', 'Ahmedabad',
  'Kolkata', 'Jaipur', 'Lucknow', 'Patna', 'Ranchi', 'Bhopal', 'Indore',
  'Nagpur', 'Surat', 'Vadodara', 'Coimbatore', 'Kochi', 'Chandigarh'
];

const STATES = [
  'Maharashtra', 'Delhi', 'Karnataka', 'Tamil Nadu', 'Telangana', 'Gujarat',
  'West Bengal', 'Rajasthan', 'Uttar Pradesh', 'Bihar', 'Jharkhand', 'Madhya Pradesh'
];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generatePhone() {
  const prefixes = ['98', '97', '96', '95', '94', '93', '91', '90', '89', '88', '87', '86', '85'];
  return getRandomItem(prefixes) + Math.floor(10000000 + Math.random() * 90000000).toString();
}

function generateEmail(firstName, lastName) {
  const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'rediffmail.com'];
  const randomNum = Math.floor(Math.random() * 999);
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomNum}@${getRandomItem(domains)}`;
}

function generatePincode() {
  return (100000 + Math.floor(Math.random() * 899999)).toString();
}

async function seedParents() {
  // Database connection - adjust as needed
  const dbName = 'campusgrid_group_bc7c680b_0b08_4fd9_b4ba_08620074fe77';
  
  const client = new Client({
    host: 'localhost',
    port: 5433,
    user: 'school_admin',
    password: 'school123',
    database: dbName
  });

  try {
    await client.connect();
    console.log(`Connected to database: ${dbName}`);

    // Get first 50 students that don't have parents
    const studentsResult = await client.query(`
      SELECT s.id, s.first_name, s.last_name, s.school_id
      FROM students s
      WHERE s.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM student_parents sp WHERE sp.student_id = s.id
      )
      LIMIT 50
    `);

    console.log(`Found ${studentsResult.rows.length} students without parents`);

    if (studentsResult.rows.length === 0) {
      // If all students have parents, get first 50 students anyway
      const allStudents = await client.query(`
        SELECT s.id, s.first_name, s.last_name, s.school_id
        FROM students s
        WHERE s.status = 'active'
        LIMIT 50
      `);
      studentsResult.rows = allStudents.rows;
      console.log(`Using ${studentsResult.rows.length} students (may already have parents)`);
    }

    let parentsAdded = 0;
    let linksCreated = 0;

    for (const student of studentsResult.rows) {
      // Create father
      const fatherFirstName = getRandomItem(FIRST_NAMES_MALE);
      const lastName = student.last_name || getRandomItem(LAST_NAMES);
      const fatherPhone = generatePhone();
      const fatherEmail = generateEmail(fatherFirstName, lastName);
      const occupation1 = getRandomItem(OCCUPATIONS);
      const city = getRandomItem(CITIES);
      const state = getRandomItem(STATES);
      const address = `${Math.floor(Math.random() * 999) + 1}, ${getRandomItem(['Main Road', 'Station Road', 'Market Area', 'Gandhi Nagar', 'Nehru Colony', 'Shastri Nagar'])}`;
      const pincode = generatePincode();

      // Insert father
      const fatherResult = await client.query(`
        INSERT INTO parents (
          school_id, parent_type, first_name, last_name, email, phone,
          occupation, address, city, state, pincode, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
        RETURNING id
      `, [student.school_id, 'father', fatherFirstName, lastName, fatherEmail, fatherPhone,
          occupation1, address, city, state, pincode]);

      parentsAdded++;

      // Link father to student
      await client.query(`
        INSERT INTO student_parents (student_id, parent_id, relationship, is_primary, is_guardian)
        VALUES ($1, $2, 'father', true, true)
        ON CONFLICT (student_id, parent_id) DO NOTHING
      `, [student.id, fatherResult.rows[0].id]);
      linksCreated++;

      // Create mother
      const motherFirstName = getRandomItem(FIRST_NAMES_FEMALE);
      const motherPhone = generatePhone();
      const motherEmail = generateEmail(motherFirstName, lastName);
      const occupation2 = Math.random() > 0.4 ? getRandomItem(OCCUPATIONS) : 'Homemaker';

      // Insert mother
      const motherResult = await client.query(`
        INSERT INTO parents (
          school_id, parent_type, first_name, last_name, email, phone,
          occupation, address, city, state, pincode, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
        RETURNING id
      `, [student.school_id, 'mother', motherFirstName, lastName, motherEmail, motherPhone,
          occupation2, address, city, state, pincode]);

      parentsAdded++;

      // Link mother to student
      await client.query(`
        INSERT INTO student_parents (student_id, parent_id, relationship, is_primary, is_guardian)
        VALUES ($1, $2, 'mother', false, true)
        ON CONFLICT (student_id, parent_id) DO NOTHING
      `, [student.id, motherResult.rows[0].id]);
      linksCreated++;

      console.log(`Added parents for student: ${student.first_name} ${student.last_name}`);
    }

    console.log('\n========================================');
    console.log(`Total parents created: ${parentsAdded}`);
    console.log(`Total student-parent links: ${linksCreated}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('Error seeding parents:', error);
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}

seedParents();

