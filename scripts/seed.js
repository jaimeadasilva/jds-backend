require("dotenv").config();
const path   = require("path");
const fs     = require("fs");
const bcrypt = require("bcryptjs");
const { v4: uuid } = require("uuid");

async function main() {
  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs();
  const DB_PATH = path.resolve(process.env.DB_PATH || "./data/jds.db");

  if (!fs.existsSync(DB_PATH)) {
    console.error("❌  Run migrate.js first!"); process.exit(1);
  }

  const sqldb = new SQL.Database(fs.readFileSync(DB_PATH));
  const now = new Date().toISOString();
  const hash = pw => bcrypt.hashSync(pw, 10);

  const run = (sql, p) => sqldb.run(sql, p);

  // Clear
  ["exercise_logs","exercises","workout_days","workout_plans","meals","nutrition_plans",
   "equipment","medical_records","weight_logs","files","templates_workout","templates_nutrition",
   "clients","users"].forEach(t => sqldb.run(`DELETE FROM ${t}`));
  console.log("🗑   Cleared existing data.\n");

  // Coach
  const coachId = uuid();
  run(`INSERT INTO users VALUES (?,?,?,?,?,?,?)`,
    [coachId,"coach@jdsclinic.com",hash("Coach123!"),"coach","Dr. Da Silva",now,now]);
  console.log("👨‍⚕️  Coach: coach@jdsclinic.com / Coach123!");

  const clients = [
    { email:"sarah@example.com",   name:"Sarah Al-Hassan", age:32, h:165, w:74,  goal:"Fat Loss",    prog:68, av:"SA",
      eq:["Dumbbells","Resistance Bands","Home"],
      med:[{t:"restriction",tx:"Avoid heavy lumbar flexion – mild L4/L5 disc issue."}],
      days:[
        {l:"Day 1",f:"Upper Body Push",ex:[
          {n:"Push-Up Variations",s:3,r:"12–15",no:"Elevate hands if needed",v:"https://youtube.com/watch?v=IODxDxX7oi4"},
          {n:"Dumbbell Shoulder Press",s:3,r:"12",no:"Control the descent",v:""},
          {n:"Lateral Raise",s:3,r:"15",no:"Light weight",v:""}]},
        {l:"Day 2",f:"Lower Body",ex:[
          {n:"Goblet Squat",s:4,r:"12",no:"Focus on depth",v:""},
          {n:"Romanian Deadlift",s:3,r:"10",no:"Hip hinge",v:""},
          {n:"Glute Bridge",s:3,r:"15",no:"Drive through heels",v:""}]},
        {l:"Day 3",f:"Full Body Burn",ex:[
          {n:"Band Pull-Apart",s:3,r:"20",no:"Squeeze shoulder blades",v:""},
          {n:"Squat to Press",s:3,r:"10",no:"Fluid movement",v:""}]}],
      nut:{cal:1700,p:130,c:170,f:55,meals:[
        {n:"Breakfast",i:"🌅",fo:"Oats, egg whites, banana",cal:420,p:28,c:58,f:8},
        {n:"Lunch",i:"☀️",fo:"Grilled chicken, brown rice, salad",cal:520,p:45,c:55,f:12},
        {n:"Snack",i:"🍎",fo:"Greek yogurt, almonds",cal:210,p:18,c:14,f:10},
        {n:"Dinner",i:"🌙",fo:"Salmon, sweet potato, broccoli",cal:550,p:39,c:43,f:25}]},
      wts:[{kg:78,d:90},{kg:76.5,d:60},{kg:75.2,d:30},{kg:74,d:0}]},

    { email:"mohammed@example.com", name:"Mohammed Khalil", age:28, h:178, w:82, goal:"Muscle Gain", prog:45, av:"MK",
      eq:["Barbell","Dumbbells","Machines","Gym"], med:[],
      days:[
        {l:"Day 1",f:"Chest & Triceps",ex:[
          {n:"Bench Press",s:4,r:"8",no:"Progressive overload",v:""},
          {n:"Incline Dumbbell Press",s:3,r:"10",no:"Slow eccentric",v:""},
          {n:"Cable Flye",s:3,r:"12",no:"Full stretch",v:""},
          {n:"Tricep Pushdown",s:3,r:"12",no:"",v:""}]},
        {l:"Day 2",f:"Back & Biceps",ex:[
          {n:"Deadlift",s:4,r:"6",no:"Heavy, reset each rep",v:""},
          {n:"Pull-Up",s:3,r:"8",no:"Add weight if easy",v:""},
          {n:"Barbell Row",s:3,r:"8",no:"Pull to lower chest",v:""}]}],
      nut:{cal:2800,p:180,c:310,f:75,meals:[
        {n:"Breakfast",i:"🌅",fo:"5 eggs, oats, milk",cal:720,p:45,c:80,f:22},
        {n:"Lunch",i:"☀️",fo:"Beef stir-fry, white rice",cal:780,p:52,c:90,f:22},
        {n:"Pre-Workout",i:"⚡",fo:"Banana, peanut butter toast",cal:380,p:12,c:55,f:11},
        {n:"Post-Workout",i:"💪",fo:"Protein shake, dates",cal:360,p:40,c:42,f:5},
        {n:"Dinner",i:"🌙",fo:"Chicken pasta, olive oil",cal:560,p:31,c:43,f:15}]},
      wts:[{kg:78,d:60},{kg:80,d:30},{kg:82,d:0}]},

    { email:"layla@example.com", name:"Layla Nasser", age:45, h:162, w:68, goal:"Maintenance", prog:82, av:"LN",
      eq:["Dumbbells","Gym"],
      med:[{t:"injury",tx:"Right knee meniscus – avoid deep squats."},{t:"note",tx:"Hypertension – keep RPE ≤ 7."}],
      days:[{l:"Day 1",f:"Low Impact + Core",ex:[
        {n:"Incline Treadmill Walk",s:1,r:"30 min",no:"RPE 5–6",v:""},
        {n:"Plank Hold",s:3,r:"45 sec",no:"Brace core",v:""},
        {n:"Dead Bug",s:3,r:"10 each",no:"Slow and controlled",v:""}]}],
      nut:{cal:1900,p:120,c:210,f:60,meals:[
        {n:"Breakfast",i:"🌅",fo:"Greek yogurt, berries, walnuts",cal:350,p:22,c:30,f:14},
        {n:"Lunch",i:"☀️",fo:"Lentil soup, whole grain bread",cal:480,p:24,c:65,f:12},
        {n:"Snack",i:"🍎",fo:"Apple, cheese",cal:200,p:8,c:24,f:10},
        {n:"Dinner",i:"🌙",fo:"Baked fish, quinoa, veg",cal:870,p:66,c:91,f:24}]},
      wts:[{kg:68,d:90},{kg:68,d:0}]},

    { email:"carlos@example.com", name:"Carlos Mendes", age:38, h:180, w:95, goal:"Fat Loss", prog:31, av:"CM",
      eq:["Barbell","Machines","Gym"],
      med:[{t:"note",tx:"Type 2 Diabetes – monitor glucose."}],
      days:[{l:"Day 1",f:"Metabolic Circuit",ex:[
        {n:"Kettlebell Swing",s:4,r:"15",no:"Hip power",v:""},
        {n:"Box Step-Up",s:3,r:"12 each",no:"Controlled",v:""}]}],
      nut:{cal:2200,p:165,c:220,f:65,meals:[
        {n:"Breakfast",i:"🌅",fo:"Scrambled eggs, avocado toast",cal:480,p:28,c:38,f:22},
        {n:"Lunch",i:"☀️",fo:"Turkey wrap, salad",cal:520,p:42,c:52,f:18},
        {n:"Dinner",i:"🌙",fo:"Grilled steak, roasted veg",cal:640,p:55,c:30,f:25}]},
      wts:[{kg:100,d:60},{kg:95,d:0}]},
  ];

  for (const cd of clients) {
    const cid = uuid();
    run(`INSERT INTO users VALUES (?,?,?,?,?,?,?)`,
      [cid,cd.email,hash("Client123!"),"client",cd.name,now,now]);
    run(`INSERT INTO clients VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [cid,coachId,cd.age,cd.h,cd.w,cd.goal,cd.prog,cd.av,now,now]);

    for (const item of cd.eq) run(`INSERT OR IGNORE INTO equipment VALUES (?,?,?)`, [uuid(),cid,item]);
    for (const m of cd.med) run(`INSERT INTO medical_records VALUES (?,?,?,?,?)`, [uuid(),cid,m.t,m.tx,now]);

    for (const wt of cd.wts) {
      const d = new Date(); d.setDate(d.getDate()-wt.d);
      run(`INSERT INTO weight_logs VALUES (?,?,?,?,?)`, [uuid(),cid,wt.kg,d.toISOString(),null]);
    }

    const planId = uuid();
    run(`INSERT INTO workout_plans VALUES (?,?,?,?,1,?,?,?)`,
      [planId,cid,coachId,`${cd.name.split(" ")[0]}'s Training Plan`,null,now,now]);

    for (let di=0; di<cd.days.length; di++) {
      const day = cd.days[di]; const dayId = uuid();
      run(`INSERT INTO workout_days VALUES (?,?,?,?,?)`, [dayId,planId,day.l,day.f,di]);
      for (let ei=0; ei<day.ex.length; ei++) {
        const ex = day.ex[ei];
        run(`INSERT INTO exercises VALUES (?,?,?,?,?,?,?,?)`,
          [uuid(),dayId,ex.n,ex.s,ex.r,ex.no||null,ex.v||null,ei]);
      }
    }

    const nid = uuid();
    run(`INSERT INTO nutrition_plans VALUES (?,?,?,?,?,?,?,?,1,?,?,?)`,
      [nid,cid,coachId,`${cd.name.split(" ")[0]}'s Nutrition Plan`,cd.nut.cal,cd.nut.p,cd.nut.c,cd.nut.f,null,now,now]);
    for (let mi=0; mi<cd.nut.meals.length; mi++) {
      const m = cd.nut.meals[mi];
      run(`INSERT INTO meals VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [uuid(),nid,m.n,m.i,m.fo,m.cal,m.p,m.c,m.f,mi]);
    }
    console.log(`   ✅  ${cd.name} — ${cd.email} / Client123!`);
  }

  // Templates
  const wt = [
    ["Fat Loss Circuit A",3,"Full Body"],["Hypertrophy Push/Pull",4,"Split"],
    ["Low Impact Rehab",2,"Mobility"],["12-Week Bulk",5,"Hypertrophy"]];
  for (const [n,d,f] of wt)
    run(`INSERT INTO templates_workout VALUES (?,?,?,?,?,?)`, [uuid(),coachId,n,d,f,now]);

  const nt = [
    ["1700 kcal Cut",1700,130,170,55],["2800 kcal Bulk",2800,180,310,75],
    ["1900 kcal Maintenance",1900,120,210,60],["2200 kcal Moderate Cut",2200,165,220,65]];
  for (const [n,cal,p,c,f] of nt)
    run(`INSERT INTO templates_nutrition VALUES (?,?,?,?,?,?,?,?)`, [uuid(),coachId,n,cal,p,c,f,now]);

  console.log("\n📋  Templates seeded.");
  fs.writeFileSync(DB_PATH, Buffer.from(sqldb.export()));
  console.log("\n🌱  Seed complete!\n");
  sqldb.close();
}

main().catch(e => { console.error(e); process.exit(1); });
