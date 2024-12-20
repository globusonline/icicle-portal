/* eslint-disable */

import React, {useState, useEffect, useRef} from 'react';

import { useGlobusAuth } from "@globus/react-auth-context";
import {RequireAuthentication} from "@/components/RequireAuthentication"
import { search } from "@globus/sdk";

import * as d3 from 'd3';

const SEARCH_INDEX = '635b610a-4ea9-4761-825a-30dcde98adc9';
const FACET_DEFS =  [
  {
    "field_name": "mode_first_char",
    "type": "terms",
    "size": 99999
  },
  {
    "field_name": "user_id",
    "type": "terms",
    "size": 99999
  },
  {
    "field_name": "group_id",
    "type": "terms",
    "size": 99999
  }
];

let count = 0;

const DOM = {
  uid: (name) => {
    return new Id("O-" + (name == null ? "" : name + "-") + ++count);
  }
}
function Id(id) {
  this.id = id;
  this.href = new URL(`#${id}`, location) + "";
}

Id.prototype.toString = function() {
  return "url(" + this.href + ")";
};


export default function Wrapper() {
  return (
    <RequireAuthentication>
      <Visualization />
    </RequireAuthentication>
  );
}

const VIEW_BY = 'group_id';

function Visualization() {
  const auth = useGlobusAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await (await search.query.post(SEARCH_INDEX, {
          payload: {
            "q": "*",
            "facets": FACET_DEFS,
            "offset": 0,
            "limit": 0,
            "filters": []
          }
        }, { manager: auth.authorization })).json();


        let facet = res.facet_results.find((r) => r.name === VIEW_BY);
        let grandchildren = [];
        if (VIEW_BY === 'group_id' && FACET_DEFS.find((f) => f.field_name === 'user_id')) {
         grandchildren = [
           { 
             name: "user_id",
             children: [true],
             parent: facet.name
           }
         ];
        }
        const data = {
          name: facet.name,
          children: facet.buckets.map((b) => ({ name: b.value, value: b.count, children: grandchildren}))
        };


        const stats = res.facet_results.reduce((acc, r) => {
          const counts = r.buckets.map((b) => b.count);
          acc[r.name] = {
            max: Math.max(...counts),
            min: Math.min(...counts)
          }
          return acc;
        }, {});


        setData({
          data,
          stats
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);
  return loading ? <div>Loading...</div> : <Treemap config={data} />;
}

function Treemap({ config }) {
  const width = 928;
  const height = 800;

  const { data, stats } = config;

  // This custom tiling function adapts the built-in binary tiling function
  // for the appropriate aspect ratio when the treemap is zoomed-in.
  function tile(node, x0, y0, x1, y1) {
    d3.treemapBinary(node, 0, 0, width, height);
    for (const child of node.children) {
      child.x0 = x0 + (child.x0 / width) * (x1 - x0);
      child.x1 = x0 + (child.x1 / width) * (x1 - x0);
      child.y0 = y0 + (child.y0 / height) * (y1 - y0);
      child.y1 = y0 + (child.y1 / height) * (y1 - y0);
    }
  }

  const ref = useRef();

  const initialHierarchy = d3
  .hierarchy(data)
  .sum((d) => d.value)
  .sort((a, b) => b.value - a.value);

  const initialRoot = d3.treemap().tile(tile)(initialHierarchy);

  // Create the scales.
  const x = d3.scaleLinear().rangeRound([0, width]);
  const y = d3.scaleLinear().rangeRound([0, height]);

  // Formatting utilities.
  const format = d3.format(",d");
  const name = (d) =>
    d
      .ancestors()
      .reverse()
      .map((d) => d.data.name)
      .join("/");
  const color = d3.scaleOrdinal([1000, 2000, 3000], d3.schemeTableau10);



  function render(group, root) {
    const node = group
      .selectAll("g")
      .data((root.children || []).concat(root))
      .join("g");
  
    // node
    //   .filter((d) => (d === root ? d.parent : d.children))
    //   .attr("cursor", "pointer")
    //   .on("click", (event, d) => (d === root ? zoomout(root) : zoomin(d)));
  
    node.append("title").text((d) => `${name(d)}\n${format(d.value)}`);
  
    node
      .append("rect")
      .attr("id", (d) => (d.leafUid = DOM.uid("leaf")).id)
      // .attr("fill", d => d === root ? "#fff" : d.children ? "#ccc" : "#ddd")
      .attr("fill", (d) => {
        const percentile = d.value / stats?.[VIEW_BY]?.max;
  
        if (percentile >= 0.9) {
          return d3.schemeTableau10[2];
        }
        if (percentile >= 0.7) {
          return d3.schemeTableau10[1];
        }
        if (percentile >= 0.6) {
          return d3.schemeTableau10[5];
        }
        if (percentile >= 0.3) {
          return d3.schemeTableau10[0];
        }
        return d3.schemeTableau10[3];
      })
      .attr("stroke", "#fff");
  
    node
      .append("clipPath")
      .attr("id", (d) => (d.clipUid = DOM.uid("clip")).id)
      .append("use")
      .attr("xlink:href", (d) => d.leafUid.href);
  
    node
      .append("text")
      .attr("clip-path", (d) => d.clipUid)
      .attr("font-weight", (d) => (d === root ? "bold" : null))
      .selectAll("tspan")
      .data((d) =>
        (d === root ? name(d) : d.data.name)
          .split(/(?=[A-Z][^A-Z])/g)
          .concat(format(d.value))
      )
      .join("tspan")
      .attr("x", 3)
      .attr(
        "y",
        (d, i, nodes) => `${(i === nodes.length - 1) * 0.3 + 1.1 + i * 0.9}em`
      )
      .attr("fill-opacity", (d, i, nodes) =>
        i === nodes.length - 1 ? 0.7 : null
      )
      .attr("font-weight", (d, i, nodes) =>
        i === nodes.length - 1 ? "normal" : null
      )
      .text((d) => d);
  
    group.call(position, root);
  }
  
  function position(group, root) {
    group
      .selectAll("g")
      .attr("transform", (d) =>
        d === root ? `translate(0,-30)` : `translate(${x(d.x0)},${y(d.y0)})`
      )
      .select("rect")
      .attr("width", (d) => (d === root ? width : x(d.x1) - x(d.x0)))
      .attr("height", (d) => (d === root ? 30 : y(d.y1) - y(d.y0)));
  }
  
  // When zooming in, draw the new nodes on top, and fade them in.
  async function zoomin(d) {
    const group0 = group.attr("pointer-events", "none");
  
    console.log(d, VIEW_BY, PRESET);
  
    const response = await (
      await globus.search.query.post(SEARCH_INDEX, {
        payload: {
          q: "",
          facets: [
            {
              field_name: "user_id",
              type: "terms",
              size: 999999,
            },
          ],
          offset: 0,
          limit: 0,
          filters: [
            {
              type: "match_any",
              field_name: "group_id",
              values: [d.data.name],
            },
          ],
        },
        headers: {
          authorization: `Bearer ${TOKEN.trim()}`,
        },
      })
    ).json();
  
    const children = response.facet_results[0].buckets.map((b) => {
      return {
        name: `user:${b.value}`,
        value: b.count,
      };
    });
  
    const hierarchy = d3
      .hierarchy({
        name: `group:${d.data.name}:users`,
        children,
      })
      .sum((d) => d.value)
      .sort((a, b) => b.value - a.value);
    const root = d3.treemap().tile(tile)(hierarchy);
  
    group0.remove();
  
    const group1 = (group = svg.append("g").call(render, root));
  
    // group0.remove();
  
    // svg.transition()
    //     .duration(750)
    //     .call(t => group0.transition(t).remove()
    //       .call(position, d.parent))
    //     .call(t => group1.transition(t)
    //       .attrTween("opacity", () => d3.interpolate(0, 1))
    //       .call(position, d));
  }
  
  // When zooming out, draw the old nodes on top, and fade them out.
  function zoomout(d) {
    const group0 = group.attr("pointer-events", "none");
    const group1 = (group = svg.insert("g", "*").call(render, d.parent));
  
    x.domain([d.parent.x0, d.parent.x1]);
    y.domain([d.parent.y0, d.parent.y1]);
  
    svg
      .transition()
      .duration(750)
      .call((t) =>
        group0
          .transition(t)
          .remove()
          .attrTween("opacity", () => d3.interpolate(1, 0))
          .call(position, d)
      )
      .call((t) => group1.transition(t).call(position, d.parent));
  }






  useEffect(() => {
    const svgElement = d3.select(ref.current);
    svgElement.append("g").call(render, initialRoot);
  }, []);

  return <svg 
    ref={ref} 
    width={width} 
    height={height + 30}
    viewBox={`.5 -30.5 ${width} ${height + 30}`}
    style={{
      maxWidth: '100%',
      height: 'auto',
    }}
  />;
} 