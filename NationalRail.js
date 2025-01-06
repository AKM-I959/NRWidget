//Bad idea but blame iOS limitations.
const API_TOKEN = ""

const NUM_SERVICES = 3  // Number of services to show in each direction

// Main function to run the widget
async function run() {
    // Get stations from parameters or use defaults (BIS & LST)
    let params = args.widgetParameter ? args.widgetParameter.split(",") : ["BIS", "LST"]
    const STATION_A = (params[0] || "BIS").trim().toUpperCase()
    const STATION_B = (params[1] || "LST").trim().toUpperCase()
    
    // Create and show widget
    let widget = await createWidget(STATION_A, STATION_B)
    
    if (config.runsInApp) {
        widget.presentLarge()
    }
    
    Script.setWidget(widget)
    Script.complete()
}

// Have to do this so we can extract the parameters from the widget before displaying content.
await run()

// National Rail uses a SOAP API with XML instead of JSON. Annoying.
function createSoapRequest(fromStation, toStation) {
  return `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:typ="http://thalesgroup.com/RTTI/2013-11-28/Token/types" xmlns:ldb="http://thalesgroup.com/RTTI/2017-10-01/ldb/">
   <soap:Header>
      <typ:AccessToken>
         <typ:TokenValue>${API_TOKEN}</typ:TokenValue>
      </typ:AccessToken>
   </soap:Header>
   <soap:Body>
      <ldb:GetDepBoardWithDetailsRequest>
         <ldb:numRows>${NUM_SERVICES}</ldb:numRows>
         <ldb:crs>${fromStation}</ldb:crs>
         <ldb:filterCrs>${toStation}</ldb:filterCrs>
         <ldb:filterType>to</ldb:filterType>
         <ldb:timeOffset>0</ldb:timeOffset>
         <ldb:timeWindow>120</ldb:timeWindow>
      </ldb:GetDepBoardWithDetailsRequest>
   </soap:Body>
</soap:Envelope>`
}

// Use regex to extract values for a given tag from XML.
// Would use libraries but Scriptable uses very cut down JS.
function getTagValue(xml, tag) {
  const regex = new RegExp(`<(?:lt\\d+:)?${tag}>(.*?)</(?:lt\\d+:)?${tag}>`)
  const match = xml.match(regex)
  return match ? match[1] : "N/A"
}

// Gives you the time between departure and arrival.
function calculateJourneyTime(dep, arr) {
  const depTime = new Date(`2000-01-01T${dep}:00`)
  const arrTime = new Date(`2000-01-01T${arr}:00`)
  const diffMinutes = Math.round((arrTime - depTime) / (1000 * 60))
  return `Journey: ${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}m`
}

// Returns the status for the service including any reasons for delay or cancellation if present.
function getStatusText(service) {
  if (service.isDelayed) {
    const depStatus = service.departure.expected !== "On time" ? service.departure.expected : ""
    const arrStatus = service.arrival.expected !== "On time" ? service.arrival.expected : ""
    return `Delayed: ${depStatus} ${arrStatus}`.trim()
  }
  return "On time"
}

// Function to parse train services from SOAP response
function parseTrainServices(xmlText) {
  const services = []
  
  // Find the trainServices section
  const trainServicesMatch = xmlText.match(/<lt7:trainServices>(.*?)<\/lt7:trainServices>/s)
  if (!trainServicesMatch) return []
  
  // Split into individual services
  const serviceMatches = trainServicesMatch[1].match(/<lt7:service>.*?<\/lt7:service>/gs)
  if (!serviceMatches) return []
  
  for (const service of serviceMatches) {
    // Get departure info
    const std = getTagValue(service, 'std')
    const etd = getTagValue(service, 'etd')
    
    // Get destination details from last calling point
    const callingPointsMatch = service.match(/<lt7:subsequentCallingPoints>.*?<\/lt7:subsequentCallingPoints>/s)
    let sta = "N/A"
    let eta = "N/A"
    
    if (callingPointsMatch) {
      const callingPointListMatch = callingPointsMatch[0].match(/<lt7:callingPointList>.*?<\/lt7:callingPointList>/s)
      if (callingPointListMatch) {
        const callingPoints = callingPointListMatch[0].match(/<lt7:callingPoint>.*?<\/lt7:callingPoint>/gs)
        if (callingPoints && callingPoints.length > 0) {
          const lastPoint = callingPoints[callingPoints.length - 1]
          sta = getTagValue(lastPoint, 'st')
          eta = getTagValue(lastPoint, 'et')
          if (eta === "") eta = "On time"
        }
      }
    }
    
    const isDelayed = etd !== "On time" || (eta !== "On time" && eta !== "N/A")
    
    services.push({
      departure: {
        scheduled: std,
        expected: etd,
      },
      arrival: {
        scheduled: sta,
        expected: eta,
      },
      isDelayed
    })
  }
  
  return services.slice(0, NUM_SERVICES)
}

// Function to fetch services for one direction
async function fetchServices(fromStation, toStation) {
  const url = "https://lite.realtime.nationalrail.co.uk/OpenLDBWS/ldb11.asmx"
  const soapBody = createSoapRequest(fromStation, toStation)
  
  const req = new Request(url)
  req.method = "POST"
  req.headers = {
    "Content-Type": "application/soap+xml;charset=UTF-8",
    "SOAPAction": "http://thalesgroup.com/RTTI/2017-10-01/ldb/GetDepBoardWithDetails"
  }
  req.body = Data.fromString(soapBody)
  
  try {
    const response = await req.loadString()
    return parseTrainServices(response)
  } catch (err) {
    console.error("API Request failed:", err)
    throw err
  }
}

// Puts the found services (if any) into the stack in the widget.
function addServicesToStack(stack, services, fromStation, toStation) {
  const container = stack.addStack()
  container.layoutVertically()
  
  // Add header
  const headerText = container.addText(`${fromStation} → ${toStation}`)
  headerText.font = Font.boldSystemFont(13)
  headerText.textColor = Color.white()
  
  container.addSpacer(8)
  
  // Add each service
  for (const service of services) {
    const serviceStack = container.addStack()
    serviceStack.layoutVertically()
    serviceStack.spacing = 2
    
    // First line: times
    const timesStack = serviceStack.addStack()
    timesStack.spacing = 4
    
    const timeText = timesStack.addText(`${service.departure.scheduled} → ${service.arrival.scheduled}`)
    timeText.font = Font.systemFont(13)
    timeText.textColor = Color.white()
    
    // Second line: status and journey time
    const infoStack = serviceStack.addStack()
    infoStack.spacing = 4
    
    const journeyTime = calculateJourneyTime(service.departure.scheduled, service.arrival.scheduled)
    const status = getStatusText(service)
    const infoText = infoStack.addText(`${status} | ${journeyTime}`)
    infoText.font = Font.systemFont(11)
    infoText.textColor = service.isDelayed ? new Color("#FF3B30") : new Color("#34C759")
    infoText.lineLimit = 1
    
    container.addSpacer(6)
  }
}

// Function to calculate refresh date from a departure time
// Means the widget will only send new requests when a train has left from either station.
// Sometimes they do not update the database even after a train should have left.
function getRefreshDate(timeStr) {
  const now = new Date()
  const [hours, minutes] = timeStr.split(':').map(Number)
  
  const departureTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours,
    minutes
  )
  
  return departureTime
}

// Create and run the widget
async function createWidget(stationA, stationB) {
  const widget = new ListWidget()
  widget.backgroundColor = new Color("#1A1A1A")
  widget.setPadding(12, 12, 12, 12)
  
  // Add URL for when widget is pressed
  widget.url = `https://www.greateranglia.co.uk/travel-information/live-departure-arrival-boards?station=${stationA}&callingAt=${stationB}`
  
  try {
    // Fetch services in both directions
    const [outwardServices, returnServices] = await Promise.all([
      fetchServices(stationA, stationB),
      fetchServices(stationB, stationA)
    ])
    
    // Calculate refresh time based on earliest departure
    if (outwardServices.length > 0 || returnServices.length > 0) {
      const outwardFirstDeparture = outwardServices[0]?.departure.scheduled
      const returnFirstDeparture = returnServices[0]?.departure.scheduled
      
      let refreshDates = []
      if (outwardFirstDeparture) refreshDates.push(getRefreshDate(outwardFirstDeparture))
      if (returnFirstDeparture) refreshDates.push(getRefreshDate(returnFirstDeparture))
      
      // Filter out null dates and find earliest
      refreshDates = refreshDates.filter(date => date !== null)
      if (refreshDates.length > 0) {
        const earliestDeparture = new Date(Math.min(...refreshDates))
        widget.refreshAfterDate = earliestDeparture
        console.log(`Widget will refresh after ${earliestDeparture.toLocaleTimeString()}`)
      }
    }
    
    // Create horizontal stack for both directions
    const mainStack = widget.addStack()
    mainStack.spacing = 16
    
    // Add outward services (left side)
    addServicesToStack(mainStack, outwardServices, stationA, stationB)
    
    // Add vertical divider
    const divider = mainStack.addStack()
    divider.backgroundColor = new Color("#333333")
    divider.size = new Size(1, 120)
    
    // Add return services (right side)
    addServicesToStack(mainStack, returnServices, stationB, stationA)
    
  } catch (error) {
    // Handle errors with logging (most of the time its just having no connection)
    console.error("Full error details:")
    console.error(error)
    
    let errorMessage = "Unable to load train times\n"
    if (error.message) {
      errorMessage += `\nError: ${error.message}`
    }
    
    const errorText = widget.addText(errorMessage)
    errorText.textColor = Color.red()
    errorText.font = Font.systemFont(12)
  }
  
  return widget
}