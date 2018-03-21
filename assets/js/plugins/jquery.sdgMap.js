(function($, d3, window, document, undefined) {

  // Create the defaults once
  var pluginName = 'sdgMap',
    defaults = {
      serviceUrl: 'https://geoportal1-ons.opendata.arcgis.com/datasets/686603e943f948acaa13fb5d2b0f1275_4.geojson',
      width: 590,
      height: 590
    };

  function Plugin(element, options) {
    this.element = element;
    this.options = $.extend({}, defaults, options);

    this._defaults = defaults;
    this._name = pluginName;

    this.valueRange = [_.min(_.pluck(this.options.geoData, 'Value')), _.max(_.pluck(this.options.geoData, 'Value'))];

    this.years = _.uniq(_.pluck(this.options.geoData, 'Year'));
    this.currentYear = this.years[0];
    
    this.init();
  }

  Plugin.prototype = {
    init: function() {
      var centered, projection, path,
        g, effectLayer, resetButton, 
        tooltip, slider, infoPanel,
        that = this,
        width = this.options.width,
        height = this.options.height;

      // Define color scale
      var color = d3.scaleLinear()
        .domain([1, 10])
        //.clamp(true)
        .range(['#fff', '#004433']);

      color.domain(this.valueRange);

      // Load map data
      d3.json(this.options.serviceUrl, function(error, mapData) {

        if(error || !mapData.features) {
          return showError.call(that);
        }

        var features = mapData.features;

        initialiseUI.call(that);

        // Update color scale domain based on data
        //color.domain([d3.min(features, getValue.bind(that)), d3.max(features, getValue.bind(that))]);

        projection = d3.geoMercator().fitSize([width, height], mapData);
        path = d3.geoPath().projection(projection);

        // Draw each geographical area as a path
        that.mapLayer.selectAll('path')
          .data(features)       
          .enter().append('path')
          .attr('d', path)
          .attr('vector-effect', 'non-scaling-stroke')
          .style('fill', getFill)
          .style('stroke', '#ccc')
          .on('mouseover', mouseover.bind(that))
          .on('mouseout', mouseout.bind(that))
          .on('mousemove', showTooltip.bind(that))
          .on('click', clicked.bind(that));

        appendScale.call(that);
        
      });

      function initialiseUI() {

        $(this.element).html('');

        this.svg = d3.select(this.element).append("svg")
          .attr("width", this.options.width)
          .attr("height", this.options.height); 

        // Add background
        this.svg.append('rect')
          .attr('class', 'background')
          .attr('width', this.options.width)
          .attr('height', this.options.height)
          .on('click', clicked);

        g = this.svg.append('g');

        effectLayer = g.append('g')
          .classed('effect-layer', true);

        this.mapLayer = g.append('g')
          .classed('map-layer', true);

        tooltip = $('<div />').attr('class', 'tooltip hidden');
        $(this.element).append(tooltip);

        resetButton = $('<button />')
          .attr('id', 'resetButton')
          .html('<i class="fa fa-refresh"></i>Reset')
          .on('click', clicked.bind(this, null));
        $(this.element).append(resetButton);

        slider = d3.sliderHorizontal()
          .min(_.min(this.years))
          .max(_.max(this.years))
          .step(1)
          .width(200)
          .tickFormat(d3.format('d'))
          .displayValue(false)
          .tickValues(this.years)
          .on('onchange', updateCurrentYear.bind(this));

        $(this.element).append($('<div />').attr('id', 'slider'));

        d3.select("#slider").append("svg")
          .attr("width", 275)
          .attr("height", 100)
          .append("g")
          .attr("transform", "translate(30,30)")
          .call(slider);

        infoPanel = $('<div />').attr('id', 'infoPanel');
        $(this.element).append(infoPanel);
      }

      function appendScale() {
        var key = d3.select(this.element).append("svg").attr("id", "key").attr("width", this.options.width).attr("height", 40);  

        var length = 5;
        var color = d3.scaleLinear().domain([0, length - 1]).range(['#ffffff', '#004433']);

        for (var i = 0; i < length; i++) {
          key.append('rect')
            .attr('x', i * this.options.width / 5)
            .attr('y', 0)
            .attr('width', this.options.width / 5)
            .attr('height', 20)
            .attr('fill', color(i));
        }
      } 

      function showError() {
        $(this.element).html(
          $('<div />').attr('class', 'alert alert-danger')
                      .html('Sorry, the map service is currently unavailable')
        );
      }

      // Get area name
      function getName(d){
        return d && d.properties ? d.properties.lad16nm : null;
      }

      // Get 
      function getValue(d) {
        var geoDataItem = _.findWhere(this.options.geoData, { 
          GeoCode: d.properties.lad16cd,
          Year: this.currentYear
        });

        return geoDataItem ? geoDataItem.Value : 0;
      }

      function getYearValues(d) {
        return _.where(this.options.geoData, { 
          GeoCode: d.properties.lad16cd
        });
      }

      function updateCurrentYear(year) {
        this.currentYear = year.toString();

        this.mapLayer.selectAll('path').transition().duration(500)
          .style('fill', function(d){  return getFill(d); });
      }

      // Get area name length
      function nameLength(d){
        var n = getName(d);
        return n ? n.length : 0;
      }

      // Get area color
      function getFill(d){
        return color(getValue.call(that, d));
      }

      function showInfoPanel(d) {
        var yearValues = getYearValues.call(this, d),
          content = '<h2>' + getName(d) + '</h2>';
        
        if(yearValues.length) {
          content += '<table><tr>' +
            _.map(_.pluck(yearValues, 'Year'), function(year) { return '<th>' + year + '</th>'; }).join('') + 
            '</tr><tr>' + 
            _.map(_.pluck(yearValues, 'Value'), function(value) { return '<td>' + value + '</td>'; }).join('') + 
            '</tr></table>';
        } else {
          content += '<p>No data available</p>';
        }

        infoPanel.html(content);
        infoPanel.fadeIn();
      }

      function hideInfoPanel() {
        infoPanel.fadeOut();
      }

      // When clicked, zoom in
      function clicked(d) {
        var x, y, k;

        // Compute centroid of the selected path
        if (d && centered !== d) {
          var centroid = path.centroid(d);
          x = centroid[0];
          y = centroid[1];
          k = 4;
          centered = d;

          showInfoPanel.call(this, d);
          resetButton.show();

        } else {
          x = width / 2;
          y = height / 2;
          k = 1;
          centered = null;

          hideInfoPanel();
          resetButton.hide();
        }

        // Highlight the clicked area
        this.mapLayer.selectAll('path')
          .style('fill', function(d){return centered && d===centered ? '#D5708B' : getFill(d);});

        // Zoom
        g.transition()
          .duration(750)
          .attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')scale(' + k + ')translate(' + -x + ',' + -y + ')');
      }

      function mouseover(d){
        // Highlight hovered area
        //d3.select(d).style('fill', 'orange');
      }

      function mouseout(d){
        // Reset area color
        this.mapLayer.selectAll('path')
          .style('fill', function(d){return centered && d===centered ? '#D5708B' : getFill(d);});

        tooltip.addClass("hidden");
      }

      function showTooltip(d) {
        var mouse = d3.mouse(this.svg.node())
          .map( function(d) { return parseInt(d); } );

        tooltip.removeClass("hidden")
          .attr("style", "left:"+(mouse[0] + 10)+"px;top:"+(mouse[1] + 10)+"px")
          .html(d.properties.lad16nm);// +  ' ' + getValue.call(that, d) + ' (' + d.properties.lad16cd + ')' );
      }
    },
    // additional funcs
  };

  // A really lightweight plugin wrapper around the constructor,
  // preventing against multiple instantiations
  $.fn[pluginName] = function(options) {
    return this.each(function() {
      if (!$.data(this, 'plugin_' + pluginName)) {
        $.data(this, 'plugin_' + pluginName, new Plugin(this, options));
      }
    });
  };
})(jQuery, d3, window, document);
