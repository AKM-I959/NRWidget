# NRWidget
Scriptable Widget written in JS for iOS that uses the National Rail Enquiries (NRE) [Darwin API](https://wiki.openraildata.com/index.php/TRUST_vs_Darwin#Darwin)

This is a SOAP API using XML. With the main body used as follows:

#### [GetDepBoardWithDetails](https://wiki.openraildata.com/index.php/GetDepBoardWithDetails)
```
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:typ="http://thalesgroup.com/RTTI/2013-11-28/Token/types" xmlns:ldb="http://thalesgroup.com/RTTI/2016-02-16/ldb/">
   <soap:Header>
      <typ:AccessToken>
         <typ:TokenValue>nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnnn</typ:TokenValue>
      </typ:AccessToken>
   </soap:Header>
   <soap:Body>
      <ldb:GetDepBoardWithDetailsRequest>
         <ldb:numRows>2</ldb:numRows>
         <ldb:crs>LDS</ldb:crs>
         <ldb:filterCrs></ldb:filterCrs>
         <ldb:filterType>to</ldb:filterType>
         <ldb:timeOffset>0</ldb:timeOffset>
         <ldb:timeWindow>120</ldb:timeWindow>
      </ldb:GetDepBoardWithDetailsRequest>
   </soap:Body>
</soap:Envelope>
```

## Usage

To use this you need the Scriptable app, the script installed locally on your device or on iCloud, and an API key from the National Rail you can get [here](https://opendata.nationalrail.co.uk/).