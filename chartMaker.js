const fs = require("fs");
const D3Node = require("d3-node");
const htmlParse = require("node-html-parser").parse;
const d3n = new D3Node();
const d3 = d3n.d3;

// Starting points for the graph

/**
 *
 * @param {Data points in a CSV format} csvData
 * @param {Options to change the graph} options
 * @returns
 */
async function makeGraph(csvData, options) {
  const graphWidth = 2300;
  const graphHeight = 800;
  const margin = { top: 80, bottom: 30, left: 90, right: 30 };
  const innerWidth = graphWidth - margin.left - margin.right;
  const innerHeight = graphHeight - margin.top - margin.bottom;

  // Current Intervals: Months
  var multi = 1;
  /*
   * ========================================================================
   *  Data
   * ========================================================================
   */

  if (!csvData) return new Error("no data supplied");
  var data = await d3.csvParse(csvData);
  data.forEach((d) => {
    d.date = new Date(d.date);
  });

  // FIXME need to format '\' for ppl with nicknames that include them
  var sumStat = d3
    .nest()
    .key(function (d) {
      return d.name;
    })
    .entries(data);

  var bucketIntervals, interval;
  var diff = d3.max(data, (d) => +d.date) - d3.min(data, (d) => +d.date);

  // Calc the range and set d3 range for x-axis
  if (diff < 2.628e9) {
    // less than a month
    bucketIntervals = 1000 * 60 * 60 * multi; // Hour
    interval = d3.timeDay;
  } else if (diff < 3.154e10) {
    // less than a year
    bucketIntervals = 1000 * 60 * 60 * 24 * multi; // Day
    interval = d3.timeMonth;
  } else {
    // more than a year
    bucketIntervals = 1000 * 60 * 60 * 24 * 30 * multi; // Month
    interval = d3.timeYear;
  }

  // Dates ranging from oldest date to newest date in intervals
  var buckets = createBuckets(
    [],
    new Date(d3.extent(data, (d) => d.date)[0].toDateString()),
    new Date(d3.extent(data, (d) => d.date)[1].toDateString()),
    bucketIntervals
  );

  // Set the interval date range to all the authors
  var sumStat2 = sumStat.map((auth) => {
    return { key: auth.key, values: buckets };
  });

  // Create the main SVG
  var mainSVG = d3n
    .createSVG(
      graphWidth + margin.right + margin.left,
      graphHeight + margin.top + margin.bottom
    )
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`)
    .style("font-size", "14px")
    .style("font-family", '"Open Sans", sans-serif')
    .style("font-weight", "500");

  /*
   * ========================================================================
   *  Labels
   * ========================================================================
   */

  // All the colors (10 different colors) need to change this to more than 10
  var colors = d3.scaleOrdinal(d3.schemeCategory10);

  // Title
  mainSVG
    .append("svg:text")
    .attr("x", innerWidth / 2)
    .attr("y", 0 - margin.top / 2)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("text-decoration", "underline")
    .text(
      `All Author ${
        options.type.charAt(0).toUpperCase() + options.type.slice(1)
      }`
    );

  // X-Axis
  mainSVG
    .append("text")
    .attr("text-anchor", "end")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + margin.top + 20)
    .text(`Time`);

  // Y-Axis
  mainSVG
    .append("text")
    .attr("text-anchor", "end")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.top + 20)
    .attr("x", -innerHeight / 2)
    .text(options.type.charAt(0).toUpperCase() + options.type.slice(1));

  // Legend
  var legend = mainSVG
    .append("g")
    .attr("transform", `translate(${margin.left}, 0)`)
    .selectAll("g")
    .data(sumStat)
    .enter()
    .append("g")
    .attr("class", "author")
    .attr("opacity", "1");

  legend
    .append("rect")
    .attr("x", innerWidth - 20)
    .attr("y", (d, i) => i * 20)
    .attr("width", 10)
    .attr("height", 10)
    .style("fill", (d) => colors(d.key))
    .style("pointer-events", "visible");

  legend
    .append("text")
    .attr("x", innerWidth - 8)
    .attr("y", (d, i) => i * 20 + 9)
    .text((d) => d.key);

  /*
   * ========================================================================
   *  Axises
   * ========================================================================
   */

  // X-Axis
  const xScale = d3
    .scaleTime()
    .domain(d3.extent(buckets, (d) => d))
    .range([0, innerWidth]);
  const xAxis = d3.axisBottom(xScale).ticks(interval);
  // Add X-Axis
  mainSVG
    .append("g")
    .attr("transform", "translate(0," + innerHeight + ")")
    .call(xAxis);

  let yDomain = [];
  sumStat2.forEach((auth) => {
    auth.values.forEach((d) => {
      let total = sumStat
        .filter((data) => data.key == auth.key)[0]
        .values.filter((dd) => {
          if (
            dd.date.getTime() > d.getTime() &&
            dd.date.getTime() < bucketIntervals + d.getTime()
          ) {
            return dd;
          }
        })
        .reduce((prev, current) => prev + parseInt(current[options.type]), 0);
      yDomain.push(total);
    });
  });

  // Y-Axis
  const yScale = createY(yDomain, innerHeight, options.type);
  const yAxis = d3.axisLeft(yScale);
  // Add Y-Axis
  mainSVG.append("g").call(yAxis);

  /*
   * ========================================================================
   *  Lines
   * ========================================================================
   */
  // Draw lines
  mainSVG
    .selectAll(".line")
    .data(sumStat2)
    .enter()
    .append("path")
    .attr("id", (auth) => String.raw`${auth.key}`)
    .attr("class", "line")
    .attr("d", function (auth) {
      return d3
        .line()
        .x(function (d) {
          return xScale(d);
        })
        .y(function (d) {
          // calc this before hand?
          return yScale(
            sumStat
              .filter((data) => data.key == auth.key)[0]
              .values.filter(
                (dd) =>
                  dd.date.getTime() > d.getTime() &&
                  dd.date.getTime() < bucketIntervals + d.getTime()
              )
              .reduce((prev, current) => prev + parseInt(current.add), 0)
          );
        })
        .curve(d3.curveCardinal.tension(0.7))(auth.values);
    })
    .attr("opacity", "1")
    .attr("fill", "none")
    .attr("stroke", function (d) {
      return (d.color = colors(d.key));
    })
    .attr("stroke-width", 1.5);

  /*
   * ========================================================================
   *  Mouse Click/Hover
   * ========================================================================
   */

  var mouseG = mainSVG.append("g").attr("class", "mouse-over-effect");
  mouseG
    .append("path")
    .attr("class", "mouse-line")
    .style("stroke", "black")
    .style("stroke-width", "1")
    .style("opacity", "0");

  var lines = mainSVG.selectAll(".line");

  var mousePerLine = mouseG
    .selectAll(".mouse-per-line")
    .data(sumStat)
    .enter()
    .append("g")
    .attr("class", "mouse-per-line");

  mousePerLine
    .append("circle")
    .attr("r", 7)
    .style("stroke", (d) => colors(d.key))
    .style("fill", "none")
    .style("stroke-width", "1px")
    .style("opacity", "0");

  mousePerLine.append("text").attr("transform", "translate(10,3)");

  mouseG
    .append("rect")
    .attr("id", "mouse-hover-area")
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("fill", "none")
    .attr("pointer-events", "all");

  let findXValue = xScale.invert;

  const root = htmlParse(d3n.html());
  const d3ImportSciprt = htmlParse(
    '<script src="https://d3js.org/d3.v7.min.js"></script>'
  );

  // Need to make it case sensitive
  const setOnClick = htmlParse(`<script>
    d3.selectAll('.author').on("click", function(d){
        let currentAuth = d3.select(this).selectAll("text").text();
        console.log(d3.select(document.getElementById(String.raw\`\${currentAuth}\`)));
        let currentLineOpacity = d3.select(document.getElementById(String.raw\`\${currentAuth}\`)).style("opacity");
        
        d3.select(this).transition().style("opacity", currentLineOpacity == 1 ? 0.2:1); 
        d3.select(document.getElementById(String.raw\`\${currentAuth}\`)).transition().style("opacity", currentLineOpacity == 1 ? 0:1); 
    }); 

    d3.selectAll("[id=mouse-hover-area]")
    .on("mouseout", function(){
      d3.select(".mouse-line").style("opacity", "0"); 
      d3.select(".mouse-per-line circle").style("opacity", "0"); 
      d3.select(".mouse-per-line text").style("opacity", "0"); 
    })
    .on("mouseover", function(){
      d3.select(".mouse-line").style("opacity", "0.5"); 
      d3.select(".mouse-per-line circle").style("opacity", "1"); 
      d3.select(".mouse-per-line text").style("opacity", "1"); 
    })
    .on("mousemove", function(event){
      var mouse = d3.pointer(event);
      d3.select(".mouse-line").attr("d", function() { 
        var d =  "M" + mouse[0] + "," + ${innerHeight};
        d += " " + mouse[0] + "," + 0; 
        return d; 
      }); 

      d3.selectAll(".mouse-per-line")
      .attr("transform", function(d, i ){
        var xDate = ${findXValue}(mouse[0]);

        console.log(xDate); 
        // bisect = d3.bisector(function(d){return d.date;}).right; 
        // idx = bisect(d.values, xDate); 
      });
    }); 

  </script>`);
  root.getElementsByTagName("head")[0].appendChild(d3ImportSciprt);
  root.getElementsByTagName("body")[0].appendChild(setOnClick);

  fs.writeFileSync("./authorChart.html", root.toString());
  console.log("Finished");
}

/*
 * ========================================================================
 *  Functions
 * ========================================================================
 */

function createY(data, height, type) {
  switch (type) {
    case "add":
      return d3
        .scalePow()
        .exponent(0.5)
        .domain([0, d3.max(data, (d) => +d)])
        .range([height, 0]);
    case "remove":
      return d3
        .scaleSqrt()
        .domain([0, d3.max(data, (d) => +d.remove)])
        .range([height, 0]);
  }
}

// Recursivly make the "fake data" range. starting from the start point at 00:00:00
function createBuckets(ary, startDate, endDate, bucketSizeMs) {
  if (startDate > endDate) {
    return ary;
  }

  ary.push(new Date(startDate.getTime()));
  startDate.setTime(startDate.getTime() + bucketSizeMs);

  return createBuckets(ary, startDate, endDate, bucketSizeMs);
}

makeGraph(fs.readFileSync("./authorStats.csv").toString(), { type: "add" });
// makeGraph(fs.readFileSync("./authorStats.csv").toString(), { type: "remove" });
// module.exports = {makeGraph: makeGraph()}

//2
/**
 *  - make y axis be logarithmic
 *  - Add the line that shows points
 *  - make line more smoother
 */
