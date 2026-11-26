package cz.tkkoskovi.sal

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextDecoration
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider

// The hall calendar on the home screen: the bigger the widget, the more it
// shows (status → today's programme → tomorrow too).
class HallWidget : GlanceAppWidget() {
    companion object {
        private val SMALL = DpSize(110.dp, 110.dp)
        private val WIDE = DpSize(250.dp, 110.dp)
        private val LARGE = DpSize(250.dp, 260.dp)
    }

    override val sizeMode = SizeMode.Responsive(setOf(SMALL, WIDE, LARGE))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        Api.init(context.applicationContext)
        val hall = HallModel()
        hall.load()
        val snapshot = WidgetSnapshot.of(hall)

        provideContent { Content(snapshot) }
    }

    @Composable
    private fun Content(snapshot: WidgetSnapshot) {
        val size = LocalSize.current
        val wide = size.width >= WIDE.width
        val tall = size.height >= LARGE.height

        Column(
            GlanceModifier
                .fillMaxSize()
                .background(ColorProvider(Color(0xFF003758)))
                .cornerRadius(20.dp)
                .padding(14.dp)
                .clickable(actionStartActivity<MainActivity>()),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(GlanceModifier.size(10.dp).cornerRadius(5.dp).background(ColorProvider(snapshot.color))) {}
                Spacer(GlanceModifier.width(6.dp))
                Text("SÁL", style = TextStyle(color = ColorProvider(Color(0xFFB5DEF5)), fontSize = 11.sp, fontWeight = FontWeight.Bold))
            }
            Spacer(GlanceModifier.height(4.dp))
            Text(
                snapshot.title,
                maxLines = if (wide) 2 else 3,
                style = TextStyle(color = ColorProvider(Color.White), fontSize = 15.sp, fontWeight = FontWeight.Bold),
            )
            Text(
                snapshot.detail,
                maxLines = 2,
                style = TextStyle(color = ColorProvider(Color(0xFFB5DEF5)), fontSize = 12.sp),
            )
            if (wide) {
                Spacer(GlanceModifier.height(8.dp))
                Section("Dnes", snapshot.today, if (tall) 6 else 2)
                if (tall) {
                    Spacer(GlanceModifier.height(8.dp))
                    Section("Zítra", snapshot.tomorrow, 4)
                }
            }
        }
    }

    @Composable
    private fun Section(title: String, lines: List<WidgetSnapshot.Line>, limit: Int) {
        Text(title.uppercase(), style = TextStyle(color = ColorProvider(Color(0xFFB5DEF5)), fontSize = 11.sp, fontWeight = FontWeight.Bold))
        if (lines.isEmpty()) {
            Text("Nic v plánu", style = TextStyle(color = ColorProvider(Color(0xFFB5DEF5)), fontSize = 12.sp))
        }
        lines.take(limit).forEach { line ->
            Row(GlanceModifier.fillMaxWidth().padding(top = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(GlanceModifier.size(width = 4.dp, height = 14.dp).cornerRadius(2.dp).background(ColorProvider(line.color))) {}
                Spacer(GlanceModifier.width(6.dp))
                Text(line.time, style = TextStyle(color = ColorProvider(Color.White), fontSize = 12.sp, fontWeight = FontWeight.Bold))
                Spacer(GlanceModifier.width(6.dp))
                Text(
                    line.title,
                    maxLines = 1,
                    style = TextStyle(
                        color = ColorProvider(Color.White),
                        fontSize = 12.sp,
                        textDecoration = if (line.struck) TextDecoration.LineThrough else TextDecoration.None,
                    ),
                )
            }
        }
        if (lines.size > limit) {
            Text("+ ${lines.size - limit} další", style = TextStyle(color = ColorProvider(Color(0xFFB5DEF5)), fontSize = 11.sp))
        }
    }
}

// What the widget shows, taken from the hall's data once per update.
private data class WidgetSnapshot(
    val title: String,
    val detail: String,
    val color: Color,
    val today: List<Line>,
    val tomorrow: List<Line>,
) {
    data class Line(val time: String, val title: String, val color: Color, val struck: Boolean)

    companion object {
        private val free = Color(0xFF2E9E5C)
        private val busy = Color(0xFFD95438)
        private val cleanup = Color(0xFFE09E1A)
        private val closed = Color(0xFF738C9E)

        fun of(hall: HallModel): WidgetSnapshot {
            if (!hall.hasLoaded) {
                return WidgetSnapshot("Kalendář se nepodařilo načíst", "Zkusíme to za chvíli.", closed, emptyList(), emptyList())
            }
            val today = Dates.todayKey()
            val status = hall.status()
            val color = when (status.tone) {
                Tone.Free -> free
                Tone.Busy -> busy
                Tone.Cleanup -> cleanup
                Tone.Closed -> closed
            }
            return WidgetSnapshot(status.title, status.detail, color, lines(hall.items(today)), lines(hall.items(Dates.addDays(1, today))))
        }

        private fun lines(items: List<DayItem>) = items.map { item ->
            when (item) {
                is DayItem.Reserved -> Line(
                    "${item.booking.start}–${item.booking.end}",
                    item.booking.title,
                    when {
                        item.booking.waitsForCleanup -> cleanup
                        item.booking.isTraining -> closed
                        else -> busy
                    },
                    false,
                )
                is DayItem.Cancelled -> Line("${item.notice.start}–${item.notice.end}", item.notice.title, closed, true)
                is DayItem.Free -> Line("${item.start}–${item.end}", "Volno", free, false)
            }
        }
    }
}

class HallWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = HallWidget()
}
