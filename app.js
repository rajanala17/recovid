const express = require('express')
const path = require('path')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()
const convertStateDbToResponse = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}

const convertDistDbToResponse = dbObject => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}
function authentication(request, response, next) {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken == undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}
//POST

app.post("/login/", async (request, response) => {
  const {username, password} = request.body
  const api1 = `
  SELECT 
  *
  FROM 
  user
  WHERE
  username = '${username}';`
  const dbUser = await db.get(api1)
  if (dbUser == undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPass = await bcrypt.compare(password, dbUser.password)
    if (isPass == true) {
      const payload = {username: username,}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')

      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid Password')
    }
  }
})

//GET
app.get('/states/', authentication, async (request, response) => {
  const api2 = `
  SELECT 
  *
  FROM 
  state;`
  const statesQuery = await db.all(api2)
  response.send(
    statesQuery.map(eachState => convertStateDbToResponse(eachState)),
  )
})
//GET ONE
app.get('/states/:stateId/', authentication, async (request, response) => {
  const {stateId} = request.params
  const api3 = `
  SELECT 
  *
  FROM 
  state 
  WHERE
  state_id = ${stateId};`
  const stateInfo = await db.get(api3)
  response.send(convertStateDbToResponse(stateInfo))
})
//DIST GET
app.get(
  '/districts/:districtId/',
  authentication,
  async (request, response) => {
    const {districtId} = request.params
    const api4 = `
  SELECT 
  *
  FROM 
  district 
  WHERE
  district_id = ${districtId};`
    const distInfo = await db.get(api4)
    response.send(convertDistDbToResponse(distInfo))
  },
)
//POST DIST
app.post('/districts/', authentication, async (request, response) => {
  const {stateId, districtName, cases, cured, active, deaths} = request.body
  const api5 = `
    INSERT 
    INTO 
    district 
    (state_id, district_name, cases, cured, active, deaths)
    VALUES
    (${stateId},'${districtName}',${cases},${cured},${active},${deaths});
    `
  await db.run(api5)
  response.send('District Successfully Added')
})
//DIST DELETE
app.delete(
  '/districts/:districtId/',
  authentication,
  async (request, response) => {
    const {districtId} = request.params
    const api6 = `
  DELETE 
  FROM 
  district 
  WHERE
  district_id = ${districtId};`
    await db.run(api6)
    response.send('District Removed')
  },
)
//PUT
app.put(
  '/districts/:districtId/',
  authentication,
  async (request, response) => {
    const {districtId} = request.params
    const {stateId, districtName, cases, cured, active, deaths} = request.body
    const api7 = `
  UPDATE
  district
  SET 
  state_id = ${stateId},
  district_name = '${districtName}',
  cases = ${cases},
  cured = ${cured},
  active = ${active},
  deaths = ${deaths}
  WHERE
  disrict_id = ${districtId};
  `
    app.get(
      '/states/:stateId/stats/',
      authentication,
      async (request, response) => {
        const {stateId} = request.params
        const api8 = `
    SELECT
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)
    FROM 
    district
    WHERE
    state_id = ${stateId};`
        const stats = await db.get(api8)
        response.send({
          totalCases: stats['SUM(cases)'],
          totalCured: stats['SUM(cured)'],
          totalActive: stats['SUM(active)'],
          totalDeaths: stats['SUM(deaths)'],
        })
      },
    )
  },
)
module.exports = app
