//import * as d3 from "./d3.v7.js";

function plot(data = [{x:0, y:0}]){
    //console.log(data);
    // Specify the chart’s dimensions.
    const width = 928;
    const height = 600;
    const marginTop = 20;
    const marginRight = 20;
    const marginBottom = 30;
    const marginLeft = 30;
    
    // Create the positional scales.
    const x = d3.scaleLinear()
        .domain(d3.extent(data, d => d.x))
        .range([marginLeft, width - marginRight]);
    
    const y = d3.scaleLinear()
        .domain(d3.extent(data, d => d.y))
        .range([height - marginBottom, marginTop]);
    const line = d3.line()
        .x(d => x(d.x))
        .y(d => y(d.y))
        .curve(d3.curveBasis);
    // Create the SVG container.
    const svg = d3.create("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [0, 0, width, height])
        .attr("style", "max-width: 100%; height: auto; overflow: visible; font: 10px sans-serif; currentColor: #FFFFFF");
    
    // Add the horizontal axis.
    svg.append("g")
        .attr("transform", `translate(0,${height - marginBottom})`)
        .attr("fill", "axisColor")
        .call(d3.axisBottom(x).ticks(width / 80).tickSizeOuter(0));
    
    // Add the vertical axis.
    svg.append("g")
        .attr("transform", `translate(${marginLeft},0)`)
        .attr("currentColor", "#FFFFFF")
        .call(d3.axisLeft(y))
        .call(g => g.append("text")
            .attr("x", -marginLeft)
            .attr("y", 10)
            .attr("text-anchor", "start")
            .text("I, ma"));
    
    // Draw the lines.
    svg.append("path")
      .attr("fill", "none")
      .attr("stroke", "#b92cc1")
      .attr("stroke-linejoin", "round")
      .attr("stroke-linecap", "round")
      .attr("stroke-width", 1.5)
      .attr("d", line(data));
    
    // Add an invisible layer for the interactive tip.
    const dot = svg.append("g")
        .attr("display", "none");
    
    dot.append("circle")
        .attr("r", 2.5);
    
    dot.append("text")
        .attr("text-anchor", "middle")
        .attr("y", -8);
    
    return svg.node();
}