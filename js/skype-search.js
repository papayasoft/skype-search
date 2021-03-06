var 
  template = {}, 
  re, 
  query,

  finder,
  finderAlias = function() { if(finder) { finder() } },

  ev = EvDa({
    channelList: [],
    channelIds: []
  }),
  nameList = [],
  nameMap = {},
  colorMap = {};

function swap(){
  var slosh = $(this).attr('hover');
  $(this).attr({'hover': $(this).attr('class')});
  $(this).attr({'class': slosh});
}

ev(["channelList", 'userList'], function(what, meta){
  $("#filterList").empty();

  document.getElementById("showAll")[
    (what.length ? "remove" : "set") +
    "Attribute"
  ]("disabled", true);

  _.each(['channelList', 'userList'], function(key) {
    _.each(ev(key), function(filter) {
      $(template.room({
        room: nameMap[filter] || filter,
        type: {'channelList':'label-warning', 'userList':'label-info'}[key]
      })).click(function(){
        ev.setdel(key, filter);
      }).hover(swap, swap).appendTo("#filterList");
    })
  });
});

function filterClear() {
  ev("channelList", []);
}

$(function(){
  template = {
    search: _.template($("#Search-Result").html()),
    container: _.template($("#Search-Container").html()),
    call: _.template($("#Call-Result").html()),
    channel: _.template($("#Channel-Item").html()),
    channelHeader: _.template($("#Channel-Header").html()),
    room: _.template($("#Filter-Room").html())
  };

  $.getJSON("api/conversations.php", function(data) {
    _.each(data,function(what) {
      colorMap[what.id] = nextColor();
    });
    ev.set('convodb', DB(data));
    var channels = ev('convodb').select('displayname');
    $("#room").typeahead({
      source: function(){ 
        var set;
        if(ev('state') == 'Chat') {
          set = _.difference(channels, ev("channelList"));
        } else {
          set = _.difference(ev('callList'), ev('channelList'));
        }
        return _.map(_.uniq(set), function(which) { 
          return "r: " + which;
        }).concat( _.map(nameList, function(which) {
          return "u: " + which;
        })).sort();
      },
      updater: function(what) {
        var 
          parts = what.split(':'),
          type = parts[0],
          thing = $.trim(parts[1]);

        if(type == 'r') {
          ev.setadd("channelList", thing);
        } else {
          ev.setadd("userList", nameMap[thing]);
        }
      }
    })
  });

  $.getJSON("api/whois.php", function(data) {
    _.each(data, function(value, key) {
      if(value.fullname || value.skypename) {
        nameList.push(value.fullname || value.skypename);
      }
      nameMap[value.skypename] = value.fullname || value.skypename;

      if(value.fullname) {
        nameMap[value.fullname] = value.skypename;
      }

      colorMap[value.skypename] = nextColor();
    });
  });
});

function getChannel(){
  var 
    id = parseInt(this.innerHTML),
    channel = ev('convodb')
      .find('id', id)
      .select('displayname')[0];

  this.innerHTML = channel;
  this.style.background = colorMap[id];

  $(this).addClass('convo-' + id).addClass('filterable').click(function(){
    ev("channelList", [channel]);
  });
}

function getName(){
  var value = this.innerHTML;

  if(nameMap[value]) {
    this.innerHTML = nameMap[value];
    this.style.background = colorMap[value];
  }

  var cName = value.replace(/[^\w]/g,'');

  $(this).addClass('user-' + cName).hover(
    function() { 
      $(".user-" + cName).addClass('hover'); 
      $(".user-" + cName).parent().parent().addClass('hover'); 
    },
    function() { 
      $(".user-" + cName).removeClass('hover'); 
      $(".user-" + cName).parent().parent().removeClass('hover'); 
    }
 );
}

ev.setter('calls', function(done) {
  $.getJSON("api/calls.php", function(data) {
    var db = DB();

    _.each(data, function(which) {
      var xml = $($.parseXML(which.body_xml));

      which.duration = 0;

      which.conv_dbid = which.convo_id;
      delete which.convo_id;
      which.participants = Array.prototype.slice.call((xml.find('part')).map(function(el) {

        which.duration = Math.max(
          parseInt(
            $(this).find('duration').text()
          ), 
          which.duration);

        return this.getAttribute('identity');
      }));

    });
    db.insert(data);

    db.update(function(row){
      row.visible = true;
      row.duration_real = row.duration;
      row.duration = doDuration(row.duration);
      if(!row.duration) { return; }

      row.fractional_duration = doFractionalDuration(row.duration_real);

      row.begin_timestamp = timeConvert(new Date(row.timestamp * 1000));
      row.current_video_audience = '<span>' + row.participants.sort().join('</span><span>') + '</span>';
    });

    db.remove({duration: false});

    // This is the set with calls
    ev.set(
      "callList", 
      ev('convodb').find({
        id: DB.isin(
          _.uniq(
            db
              .find()
              .select('conv_dbid')
          )
        )
      }).select('displayname')
    );

    // db is our calls
    done(db);
  })
});

function state(el) {
  $(el)
    .parent()
    .addClass("active")
    .siblings()
    .removeClass("active");

  ev("state", el.innerHTML);
}

ev({
  userList: function(what) {
    finderAlias();
  },

  channelList: function(what) {
    if(ev('channelList').length) {
      var idList = ev('convodb').find({
        displayname: DB.isin(ev('channelList'))
      }).select('id');
      ev('channelIds', idList);
    } else {
      ev('channelIds', []);
    }
  },

  channelIds: function(idList) {
    if(ev('state') == 'Calls') {
      if(idList.length) {
        ev('calls').update(function(row){
          row.visible = _.indexOf(idList, row.conv_dbid) > -1;
        });
      } else {
        ev('calls').update(function(row){
          row.visible = true;
        });
      }
    }
    finderAlias();
  },

  state: function(state) {
    if(state == "Calls") {
      $("#search").hide();
      $("#instructions").hide();
      finder = showCalls;
    } else { // chat
      $("#search").show();
      finder = showChat;
    }
    finder();
  }
});

function showCalls() {
  ev.isset('calls', function(db) {
    $("#results").empty();

    db.find({visible: true}).each(function(row) {
      if(!row.duration) { return; }

      $("<div class='row call'>")
        .html( template.call(row) )
        .appendTo("#results");

    });

    $(".channel span").each(getChannel);
    $(".members span").each(getName);
  });
}

var wait = {
  on: function(){
    $("#waiter").css('display','block');
  },
  off: function(){
    $("#waiter").css('display','none');
  }
}

function Expand(ts, convo, el, button) {
  button.level = (button.level || 0) + 1;
  $.getJSON("api/search.php", {
    ts: ts,
    convo: convo,
    level: button.level
  }, function(data) {
    var 
      rowDOM,
      lastAuthor;

    $(el)
      .empty()
      .hide()
      .addClass("expanded");

    _.each(data, function(row) {
      if(!row) { return; }
      process(row);
      rowDOM = $("<div>").html( template.search(row) );
      if(row.rawtimestamp == ts) {
        rowDOM.addClass("highlight").click(function(){
          $(this.parentNode).slideUp(function(){
            $(this).toggleClass("off").slideDown();
          });
        });
      }
      rowDOM.appendTo(el);
    });

   $(el).slideDown();
  });
}

function process(row) {
  // a little trick to make sure we don't regex replace
  // inside of a tag.
  row.body_xml = ('>' + row.body_xml + '<')
    .replace(/\ \ /g, '&nbsp; ')
    .replace(/\n/g, "<br>")
    .replace(re, '>$1<b>$2</b>$3<')
    .slice(1, -1);

  row.rawtimestamp = row.timestamp;
  row.timestamp = timeConvert(new Date(row.timestamp * 1000));
}

function showChat() {
  var lastChannel;

  query = $("#search").val();
  window.location.hash = query;

  re = new RegExp(">(.*)(" + query + ")(.*)<", 'ig');

  if(window.location.hash.length == 0){
    return;
  } else {
    $("#instructions").css('display','none');
  }
  $("#results").empty();
  wait.on();
  $.getJSON("api/search.php", {
    q: query,
    rooms: ev('channelIds'),
    users: ev('userList')
  }, function(data) {
    wait.off();
    if(data.length) {
      _.each(data, function(row) {
        if(!row) { return; }
        process(row);

        var 
          channel = false,
          resultDOM = $("<div class='row result' />"),
          rowDOM = $("<div class='row' />").html(template.search(row));

        if(row.convo_id != lastChannel) {
          lastChannel = row.convo_id;
          $("#results").append(template.channelHeader({ channel: lastChannel}));
        }

        resultDOM.html(template.container({
          row: rowDOM.html()
        })).appendTo("#results");

        $(".expand", resultDOM).click(function(){
          Expand(row.rawtimestamp, row.convo_id, $(this).next(), this);
        })
      });
    } else {
      $("#results").html("<h2>Woops, nothing found for '" + query + "'. Check the spelling?</h2>");
    }
  });
  window.scrollTo(0,0);

  setTimeout(function(){
    ev.isset('convodb', function(d){
      $(".channel-name").each(getChannel);
    });
  }, 1500);
}


$(function(){
  $('body').css('display','block');
  $("#search").val(window.location.hash.slice(1));
  ev('state', 'Chat');

  setInterval(function(){
    if(window.location.hash.slice(1) != query) {
      $("#search").val(window.location.hash.slice(1));
      finderAlias();
    }
  }, 100);
});
