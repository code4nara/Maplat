require(["jquery", "ol-custom", "bootstrap", "slick"], function($, ol) {//"css!bootstrapcss", "css!ol3css"], function($, ol, tps) {
    var app_json = "json/" + appid + ".json";
    $.get(app_json, function(app_data) {
        $("#all").show();
        $('#loadWait').modal();
        $('.slick-class').slick({
            prevArrow: '',
            nextArrow: '',
            centerMode: true,
            focusOnSelect: true,
            slidesToScroll: 3,
            centerPadding: '40px'
        });

        var from;
        var merc_buffer = null;
        var gps_process;
        var gps_callback = function(e) {
            gps_process(e);
        };
        var home_process;
        var home_callback = function(e) {
            home_process(e);
        };
        var home_pos = app_data.home_position;
        var def_zoom = app_data.default_zoom;
        var now_sourceID = "osm";
        var app_name = app_data.app_name;
        var fake_gps = app_data.fake_gps;
        var fake_center = app_data.fake_center;
        var fake_radius = app_data.fake_radius;
        var make_binary = app_data.make_binary;
        if (fake_gps) {
            $("#gps_etc").append("※" + fake_center + "中心より" + fake_radius + "km以上離れている場合は、" + fake_center + "中心周辺の疑似経緯度を発行します");
        } else {
            $("#gps_etc").append("GPSデータ取得中です");
        }
        var pois = app_data.pois;

        $("title").html(app_name);

        var dataSource = app_data.sources;
        var dataHash = {};

        var sourcePromise = [];
        for (var i = 0; i <= dataSource.length; i++) {
            var div = "map" + i;
            if (i == dataSource.length) {
                div = "mapNow";
                sourcePromise.push(ol.source.nowMap.createAsync({
                    map_option: {
                        div: div
                    },
                    sourceID: "osm",
                    gps_callback: gps_callback,
                    home_callback: home_callback
                }));
                $('.slick-class').slick('slickAdd','<div class="slick-item" data="osm"><img src="./tmbs/osm_menu.jpg"><div>OSM(現在)</div></div>');
                $('.slick-class').slick('slickGoTo',dataSource.length);
            } else {
                var data = dataSource[i];
                if (!data.maptype) data.maptype = "maplat";
                if (!data.algorythm) data.algorythm = app_argo || "tin";
                if (data.maptype == "base") div = null;
                (function(data,div){
                    if (data.maptype == "base") {
                        data.sourceID = data.mapID;
                        sourcePromise.push(ol.source.nowMap.createAsync({
                            map_option: {
                                div: "mapNow"
                            },
                            attributions: [
                                new ol.Attribution({
                                    html: data.attr
                                })
                            ],
                            url: data.url,
                            sourceID: data.sourceID,
                            gps_callback: gps_callback,
                            home_callback: home_callback
                        }));
                    } else if (data.maptype == "overlay") {
                        data.sourceID = data.mapID;
                        sourcePromise.push(ol.source.tmsMap.createAsync({
                            map_option: {
                                div: "mapNow"
                            },
                            attributions: [
                                new ol.Attribution({
                                    html: data.attr
                                })
                            ],
                            url: data.url,
                            sourceID: data.sourceID,
                            gps_callback: gps_callback,
                            home_callback: home_callback
                        }));
                    } else {
                        data.sourceID = data.mapID + ":" + data.maptype + ":" + data.algorythm;
                        sourcePromise.push(new Promise(function (res, rej) {
                            var later_logic = function () {
                                dataHash[data.sourceID] = data;
                                var option = {
                                    attributions: [
                                        new ol.Attribution({
                                            html: data.attr
                                        })
                                    ],
                                    mapID: data.mapID,
                                    width: data.width,
                                    height: data.height,
                                    maptype: data.maptype,
                                    algorythm: data.algorythm,
                                    sourceID: data.sourceID,
                                    map_option: {
                                        div: div
                                    },
                                    gps_callback: gps_callback,
                                    home_callback: home_callback
                                };
                                if (data.algorythm == "tin") {
                                    option.tin_points_url = 'json/' + data.mapID + '_points.json';
                                } else {
                                    if (make_binary) {
                                        option.tps_serial = data.mapID + ".bin";
                                        option.tps_points = '../json/' + data.mapID + '_points.json';
                                    } else {
                                        option.tps_serial = '../bin/' + data.mapID + '.bin';
                                    }
                                }
                                res(ol.source.histMap.createAsync(option));
                            };
                            if (data.maptype == "maplat") require(["histmap_" + data.algorythm], later_logic)
                            else later_logic();
                        }));
                    }
                    $('.slick-class').slick('slickAdd','<div class="slick-item" data="' + data.sourceID + '"><img src="./tmbs/' + data.mapID + '_menu.jpg"><div>' + (data.label || data.year) + '</div></div>');
                })(data,div);
            }
            if (div) {
                $('<div id="' + div + 'container" class="col-xs-12 h100p mapcontainer w100p"><div id="' + div + '" class="map h100p"></div></div>').insertBefore('#center_circle');
            }
        }

        Promise.all(sourcePromise).then(function(sources) {
            $('#loadWait').modal('hide');

            var cache = [];
            var cache_hash = {};
            var clickavoid = false;
            var nowMap = null;
            var nowSource = null;
            var clear_buffer = function(){
                console.log("Clear buffer");
                merc_buffer = null;
            };
            for (var i=0; i<sources.length; i++) {
                var source = sources[i];
                var item;
                if (source instanceof ol.source.nowMap) {
                    if (!nowMap && !(source instanceof ol.source.tmsMap)) {
                        nowMap = source.getMap();
                    }
                    source._map = nowMap;
                    item = [source, nowMap, "#mapNowcontainer"];
                    if (!(source instanceof ol.source.tmsMap)) {
                        nowMap.exchangeSource(source);
                        nowSource = source;
                    }
                } else {
                    var map = source.getMap();
                    item = [source, map, "#map" + i + "container"];
                }
                cache.push(item);
                cache_hash[source.sourceID] = item;
            }

            gps_process = function(e) {
                var geolocation = new ol.Geolocation({tracking:true});
                // listen to changes in position
                $('#gpsWait').modal();
                var handle_gps = function(lnglat, acc) {
                    var mercs = null;
                    var filter_buffer = [];
                    for (var i=0;i<cache.length;i++) {
                        if (filter_buffer.indexOf(cache[i][1]) >= 0) continue;
                        filter_buffer.push(cache[i][1]);
                        (function(){
                            var target = cache[i];
                            var source = target[0];
                            var map    = target[1];
                            var view   = map.getView();
                            if (!mercs) {
                                mercs = source.mercsFromGPSValue(lnglat,acc);
                            }
                            Promise.all(mercs.map(function(merc,index) {
                                if (index == 5) return merc;
                                return source.merc2XyAsync(merc);
                            })).then(function(xys){
                                var center = xys[0];
                                var news = xys.slice(1);

                                var ave = news.reduce(function(prev,curr,index){
                                    var ret = prev + Math.sqrt(Math.pow(curr[0]-center[0],2)+Math.pow(curr[1]-center[1],2));
                                    return index==3 ? ret / 4.0 : ret;
                                },0);
                                if (target[1] == from[1]) view.setCenter(center);
                                map.setGPSPosition(center,ave);
                            });
                        })();
                    }
                };
                geolocation.once('change', function(evt) {
                    var lnglat = geolocation.getPosition();
                    var acc    = geolocation.getAccuracy();
                    if (fake_gps && ol.MathEx.getDistance(home_pos,lnglat) > fake_radius) {
                        lnglat = [ol.MathEx.randomFromCenter(home_pos[0], 0.001),ol.MathEx.randomFromCenter(home_pos[1], 0.001)];
                        acc    = ol.MathEx.randomFromCenter(15.0, 10);
                    }
                    geolocation.setTracking(false);
                    handle_gps(lnglat, acc);
                    $('#gpsWait').modal('hide');
                });
                geolocation.once('error', function(evt){
                    geolocation.setTracking(false);
                    if (fake_gps) {
                        var lnglat = [ol.MathEx.randomFromCenter(home_pos[0], 0.001),ol.MathEx.randomFromCenter(home_pos[1], 0.001)];
                        var acc    = ol.MathEx.randomFromCenter(15.0, 10);
                        handle_gps(lnglat, acc);
                    }
                    $('#gpsWait').modal('hide');
                })
            };

            home_process = function(e) {
                var merc = ol.proj.transform(home_pos, "EPSG:4326", "EPSG:3857");
                var source = from[0];
                var view   = from[1].getView();
                var mercs  = source.mercsFromGivenZoom(merc, def_zoom);
                source.mercs2SizeAsync(mercs).then(function(size){
                    view.setCenter(size[0]);
                    view.setZoom(size[1]);
                    view.setRotation(0);
                });
            };

            $(".slick-item").on("click",function(){
                if (!clickavoid) {
                    changeMap(false, $(this).attr("data"));
                }
            });
            $(".slick-class").on("beforeChange",function(ev, slick, currentSlide, nextSlide){
                clickavoid = currentSlide != nextSlide;
            });
            $(".slick-class").on("afterChange",function(ev, slick, currentSlide){
                clickavoid = false;
            });

            from = cache.reduce(function(prev,curr){
                if (prev) return prev;
                if (curr[0] instanceof ol.source.histMap) return curr;
                return prev;
            },null);
            changeMap(true, "osm");

            function changeMap(init,sourceID) {
                var now = cache_hash['osm'];
                var to  = cache_hash[sourceID];
                if ((to == from) && (to != now)) return;
                /*if (from == now) {
                    var layers = from[1].getLayers();
                    //ここで以前はタイルマップを削除していた、POIレイヤを削除してしまうため一時保留、後日直す
                    //while (layers.getLength() > 2) {
                    //    layers.removeAt(1);
                    //}
                    if (init == true) {
                        home_process();
                    }
                }*/
                if (to != from) {
                    var view = from[1].getView();
                    console.log("From: Center: " + view.getCenter() + " Zoom: " + view.getZoom() + " Rotation: " + view.getRotation());
                    var fromPromise = from[0].size2MercsAsync();
                    if (merc_buffer && merc_buffer.mercs && merc_buffer.buffer[from[0].sourceID]) {
                        var buffer  = merc_buffer.buffer[from[0].sourceID];
                        var current = ol.MathEx.recursiveRound([
                            view.getCenter(), view.getZoom(), view.getRotation()
                        ],10);
                        if (buffer[0][0] == current[0][0] && buffer[0][1] == current[0][1] && buffer[1] == current[1] && buffer[2] == current[2]) {
                            console.log("From: Use buffer");
                            fromPromise = new Promise(function(res, rej){
                                res(merc_buffer.mercs);
                            });
                        } else {
                            merc_buffer = {
                                buffer:{}
                            };
                        }
                    } else {
                        merc_buffer = {
                            buffer:{}
                        };
                    }

                    fromPromise.then(function(mercs){
                        merc_buffer.mercs = mercs;
                        var view = from[1].getView();
                        merc_buffer.buffer[from[0].sourceID] = ol.MathEx.recursiveRound([
                            view.getCenter(), view.getZoom(), view.getRotation()
                        ],10);
                        console.log("Mercs: " + mercs);
                        var toPromise = to[0].mercs2SizeAsync(mercs);
                        var key = to[0].sourceID;
                        if (merc_buffer.buffer[key]) {
                            console.log("To: Use buffer");
                            toPromise = new Promise(function(res, rej){
                                res(merc_buffer.buffer[key]);
                            });
                        }
                        toPromise.then(function(size){
                            console.log("To: Center: " + [size[0][0],size[0][1]] + " Zoom: " + size[1] + " Rotation: " + size[2]);
                            var to_src = to[0];
                            var to_tms = null;
                            var to_map = to[1];
                            var to_div = to[2];
                            merc_buffer.buffer[to_src.sourceID] = ol.MathEx.recursiveRound(size, 10);
                            if (to_src instanceof ol.source.nowMap) {
                                if (to_src instanceof ol.source.tmsMap) {
                                    to_map.setLayer(to_src);
                                } else {
                                    to_map.setLayer();
                                    to_map.exchangeSource(to_src);
                                    nowSource = to_src;
                                }
                            }
                            var view = to_map.getView();
                            view.setCenter(size[0]);
                            view.setZoom(size[1]);
                            view.setRotation(size[2]);
                            $(to_div).show();
                            for (var i=0;i<cache.length;i++) {
                                var div = cache[i];
                                if (div[2] != to_div) {
                                    $(div[2]).hide();
                                }
                            }
                            to_map.updateSize();
                            to_map.renderSync();
                            from = to;
                            if (init == true) {
                                home_process();
                            }
                        });
                    });
                }
            }

            function showInfo(data) {
                $("#poi_name").text(data.name);
                $("#poi_img").attr("src","img/" + data.image);
                $("#poi_address").text(data.address);
                $("#poi_desc").html(data.desc.replace(/\n/g,"<br>"));
                $('#poi_info').modal();
            }

            $("#poi_back").on("click", function(){
                $("#all").show();
                $("#info").hide();
            });

            for (var i=0; i < pois.length; i++) {
                (function(datum){
                    var lnglat = [datum.lng,datum.lat];
                    var merc = ol.proj.transform(lnglat, "EPSG:4326", "EPSG:3857");
                    var filter_buffer = [];
                    var filtered = cache.filter(function(item){
                        if (filter_buffer.indexOf(item[1]) >= 0) return false;
                        filter_buffer.push(item[1]);
                        return true;
                    });
                    var promise = filtered.map(function(item){
                        return item[0].merc2XyAsync(merc);
                    });
                    Promise.all(promise).then(function(xys){
                        filtered.map(function(item,index){
                            item[1].setMarker(xys[index],{"datum":datum});
                        });
                    });
                })(pois[i]);          
            }

            for (var i = 0; i < cache.length; i++) {
                var map = cache[i][1];
                var click_handler = (function(map){
                    return function(evt) {
                        var feature = map.forEachFeatureAtPixel(evt.pixel,
                            function (feature) {
                                if (feature.get('datum')) return feature;
                            });
                        if (feature) {
                            showInfo(feature.get('datum'));
                        }
                    };
                })(map);
                map.on('click', click_handler);

                // change mouse cursor when over marker
                var move_handler = (function(map){
                    return function(e) {
                        var pixel = map.getEventPixel(e.originalEvent);
                        var hit = map.hasFeatureAtPixel(pixel);
                        var target = map.getTarget();
                        if (hit) {
                            var feature = map.forEachFeatureAtPixel(e.pixel,
                                function (feature) {
                                    if (feature.get('datum')) return feature;
                                });
                            $("#"+target).css("cursor", feature ? 'pointer' : '');
                            return;
                        }
                        $("#"+target).css("cursor", '');
                    };
                })(map);
                map.on('pointermove', move_handler);
            }            
        });

    }, "json");
});